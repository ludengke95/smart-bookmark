/**
 * AI 智能分组与智能标签流水线编排器 (Pipeline Orchestrator)
 * 纯净通用大模型驱动 (支持 OpenAI / DeepSeek / Ollama / 本地兼容 API)
 */
import { runCustomApiPrompt } from './custom-engine.js';
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
import { serviceError } from '../errors.js';
import { t } from '../../i18n/index.svelte.js';

/**
 * 尝试从解析后的对象中提取数组列表
 */
function tryExtractArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const candidateKeys = ['items', 'result', 'data', 'list', 'bookmarks', 'tags', 'groups', 'results', 'suggestions', 'output'];
    for (const key of candidateKeys) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
  }
  return [];
}

/**
 * 鲁棒性 JSON 提取与解析器 (处理 Markdown 围栏、前后闲聊杂质、对象包壳)
 */
export function extractAndParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const cleaned = rawText.trim();

  // 1. 尝试直接完整 JSON 解析
  try {
    const parsed = JSON.parse(cleaned);
    const extracted = tryExtractArray(parsed);
    if (extracted.length > 0) return extracted;
  } catch (e) {}

  // 2. 匹配 Markdown ```json ... ``` 或 ``` ... ``` 围栏块
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match;
  while ((match = codeBlockRegex.exec(cleaned)) !== null) {
    try {
      const blockContent = match[1].trim();
      const parsed = JSON.parse(blockContent);
      const extracted = tryExtractArray(parsed);
      if (extracted.length > 0) return extracted;
    } catch (e) {}
  }

  // 3. 寻找最外层的 [ ... ]
  const startIdx = cleaned.indexOf('[');
  const endIdx = cleaned.lastIndexOf(']');
  if (startIdx >= 0 && endIdx > startIdx) {
    try {
      const sliced = cleaned.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(sliced);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {}
  }

  // 4. 寻找最外层的 { ... }
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) {
    try {
      const slicedObj = cleaned.substring(objStart, objEnd + 1);
      const parsed = JSON.parse(slicedObj);
      const extracted = tryExtractArray(parsed);
      if (extracted.length > 0) return extracted;
    } catch (err) {}
  }

  return [];
}

/**
 * 从模型输出项中提取标签数组 (兼容 suggestedTags/tags/labels/逗号分隔字符串等各种形态)
 */
function extractTagsFromItem(item, maxTags = 3) {
  if (!item || typeof item !== 'object') return [];

  const possibleValues = [
    item.suggestedTags,
    item.suggested_tags,
    item.tags,
    item.tagList,
    item.tag_list,
    item.labels,
    item.keywords,
    item.categories,
    item.tag
  ];

  for (const val of possibleValues) {
    if (!val) continue;
    if (Array.isArray(val)) {
      const extracted = val
        .map(t => {
          if (typeof t === 'string') return t.trim();
          if (t && typeof t === 'object') return String(t.name || t.tag || t.label || '').trim();
          return String(t).trim();
        })
        .filter(t => t && t.length > 0 && t.length <= 20)
        .slice(0, maxTags);
      if (extracted.length > 0) return extracted;
    } else if (typeof val === 'string' && val.trim().length > 0) {
      const parts = val
        .split(/[,，、/|;；\s]+/)
        .map(t => t.trim())
        .filter(t => t && t.length > 0 && t.length <= 20)
        .slice(0, maxTags);
      if (parts.length > 0) return parts;
    }
  }
  return [];
}

/**
 * 从模型输出项中提取推荐分组名称 (兼容 targetGroupName/group/category 等字段)
 */
function extractGroupNameFromItem(item) {
  if (!item || typeof item !== 'object') return '';

  const possible = [
    item.targetGroupName,
    item.target_group_name,
    item.suggestedGroupName,
    item.suggestedGroup,
    item.groupName,
    item.group_name,
    item.group,
    item.category,
    item.targetGroup
  ];
  for (const v of possible) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * 数组切片辅助
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ==========================================
// 1. 智能分组分析流水线 (Smart Grouping)
// ==========================================

export async function analyzeSmartGrouping({
  bookmarks = [],
  groups = [],
  aiSettings = {},
  onProgress = () => {}
}) {
  const groupingConfig = aiSettings?.grouping || { scope: 'ungrouped', allowNewGroups: true };
  const scope = groupingConfig.scope || 'ungrouped';
  const allowNewGroups = groupingConfig.allowNewGroups !== false;

  // 1. 确定待整理书签集
  let targetBookmarks = [];
  if (scope === 'ungrouped') {
    targetBookmarks = bookmarks.filter(b => !b.groupId || b.groupId === UNGROUPED_GROUP_ID);
  } else {
    targetBookmarks = [...bookmarks];
  }

  if (targetBookmarks.length === 0) {
    return {
      success: true,
      items: []
    };
  }

  // 2. 收集已有自定义分组名称
  const existingCustomGroupNames = groups
    .filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID)
    .map(g => g.name.trim())
    .filter(Boolean);

  const groupMapById = new Map(groups.map(g => [g.id, g.name]));

  // 3. 分批处理（每批 20 项）
  const BATCH_SIZE = 20;
  const chunks = chunkArray(targetBookmarks, BATCH_SIZE);
  const totalChunks = chunks.length;
  const allProposedChanges = [];

  // 指令与兜底文案来自 aiPrompt.* 语言包，随当前界面语言渲染
  const ungroupedLabel = t('aiPrompt.ungrouped');
  const systemPrompt = t('aiPrompt.groupingSystem', {
    groups: existingCustomGroupNames.join(t('aiPrompt.listSeparator')),
    rule: allowNewGroups ? t('aiPrompt.groupRuleAllowNew') : t('aiPrompt.groupRuleForbidNew')
  });

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];
    onProgress({
      phase: 'grouping',
      current: i + 1,
      total: totalChunks,
      percent: Math.round(((i + 1) / totalChunks) * 100)
    });

    const simplifiedInput = chunk.map(b => ({
      id: b.id,
      name: b.name,
      currentGroup: groupMapById.get(b.groupId) || ungroupedLabel,
      urls: (b.endpoints || []).map(ep => ep.url).slice(0, 2)
    }));

    const userPrompt = `${t('aiPrompt.groupingUser', { count: chunk.length })}\n${JSON.stringify(simplifiedInput, null, 2)}`;

    try {
      const rawOutput = await runCustomApiPrompt({
        config: aiSettings,
        systemPrompt,
        prompt: userPrompt
      });

      const parsedList = extractAndParseJson(rawOutput);
      const chunkMap = new Map(chunk.map(b => [b.id, b]));

      for (const item of parsedList) {
        if (!item) continue;
        const bmId = String(item.bookmarkId || item.id || item.bookmark_id || item.bookmarkID || '').trim();
        const origBm = chunkMap.get(bmId) || chunk.find(b => b.name && (b.name === item.name || b.name === item.bookmarkName));
        if (origBm) {
          const targetName = extractGroupNameFromItem(item);
          if (!targetName) continue;

          const currentGroupName = groupMapById.get(origBm.groupId) || '';
          const isNew = !existingCustomGroupNames.some(n => n.toLowerCase() === targetName.toLowerCase());

          allProposedChanges.push({
            bookmarkId: origBm.id,
            bookmarkName: origBm.name,
            urls: (origBm.endpoints || []).map(e => e.url),
            currentGroupId: origBm.groupId || UNGROUPED_GROUP_ID,
            currentGroupName,
            suggestedGroupName: targetName,
            isNewGroup: isNew,
            reason: item.reason || '',
            selected: currentGroupName !== targetName
          });
        }
      }
    } catch (err) {
      console.error(`Grouping analysis interrupted at chunk ${i + 1}/${totalChunks}:`, err);
      if (err?.code) throw err;
      throw serviceError('aiAnalysisFailed', 'AI grouping analysis interrupted', {}, String(err?.message || err));
    }
  }

  return {
    success: true,
    totalAnalyzed: targetBookmarks.length,
    items: allProposedChanges
  };
}

// ==========================================
// 2. 智能标签提炼流水线 (Smart Tagging)
// ==========================================

export async function analyzeSmartTagging({
  bookmarks = [],
  aiSettings = {},
  onProgress = () => {}
}) {
  const taggingConfig = aiSettings?.tagging || { scope: 'untagged', mode: 'append', maxTagsPerBookmark: 3 };
  const scope = taggingConfig.scope || 'untagged';
  const mode = taggingConfig.mode || 'append';
  const maxTags = taggingConfig.maxTagsPerBookmark || 3;

  // 1. 确定待提炼书签集
  let targetBookmarks = [];
  if (scope === 'untagged') {
    targetBookmarks = bookmarks.filter(b => !Array.isArray(b.tags) || b.tags.length === 0);
  } else {
    targetBookmarks = [...bookmarks];
  }

  if (targetBookmarks.length === 0) {
    return {
      success: true,
      items: []
    };
  }

  // 2. 分批处理（每批 20 项）
  const BATCH_SIZE = 20;
  const chunks = chunkArray(targetBookmarks, BATCH_SIZE);
  const totalChunks = chunks.length;
  const allProposedChanges = [];

  // 指令文案来自 aiPrompt.* 语言包，随当前界面语言渲染
  const systemPrompt = t('aiPrompt.taggingSystem', { maxTags });

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];
    onProgress({
      phase: 'tagging',
      current: i + 1,
      total: totalChunks,
      percent: Math.round(((i + 1) / totalChunks) * 100)
    });

    const simplifiedInput = chunk.map(b => ({
      id: b.id,
      name: b.name,
      currentTags: b.tags || [],
      urls: (b.endpoints || []).map(ep => ep.url).slice(0, 2)
    }));

    const userPrompt = `${t('aiPrompt.taggingUser', { count: chunk.length })}\n${JSON.stringify(simplifiedInput, null, 2)}`;

    try {
      const rawOutput = await runCustomApiPrompt({
        config: aiSettings,
        systemPrompt,
        prompt: userPrompt
      });

      const parsedList = extractAndParseJson(rawOutput);
      const chunkMap = new Map(chunk.map(b => [b.id, b]));

      for (const item of parsedList) {
        if (!item) continue;
        const bmId = String(item.bookmarkId || item.id || item.bookmark_id || item.bookmarkID || '').trim();
        const origBm = chunkMap.get(bmId) || chunk.find(b => b.name && (b.name === item.name || b.name === item.bookmarkName));
        if (origBm) {
          const rawTags = extractTagsFromItem(item, maxTags);
          if (rawTags.length === 0) continue;

          const existingTags = Array.isArray(origBm.tags) ? origBm.tags : [];
          let finalTags = [];
          if (mode === 'replace') {
            finalTags = rawTags;
          } else {
            finalTags = Array.from(new Set([...existingTags, ...rawTags]));
          }

          const oldTagStr = existingTags.slice().sort().join(',');
          const newTagStr = finalTags.slice().sort().join(',');
          const hasChange = oldTagStr !== newTagStr;

          allProposedChanges.push({
            bookmarkId: origBm.id,
            bookmarkName: origBm.name,
            urls: (origBm.endpoints || []).map(e => e.url),
            currentTags: existingTags,
            suggestedTags: rawTags,
            finalMergedTags: finalTags,
            mode,
            reason: item.reason || '',
            selected: true
          });
        }
      }
    } catch (err) {
      console.error(`Tag refinement interrupted at chunk ${i + 1}/${totalChunks}:`, err);
      if (err?.code) throw err;
      throw serviceError('aiAnalysisFailed', 'AI tag refinement interrupted', {}, String(err?.message || err));
    }
  }

  return {
    success: true,
    totalAnalyzed: targetBookmarks.length,
    items: allProposedChanges
  };
}

// ==========================================
// 3. 外部大模型手动回复解析适配器 (Manual Result Parser)
// ==========================================

export function parseManualAiResult({
  rawInput = '',
  type = 'grouping', // 'grouping' | 'tagging'
  bookmarks = [],
  groups = [],
  options = {}
}) {
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    throw serviceError('aiEmptyInput', 'Empty input');
  }

  const parsedList = extractAndParseJson(rawInput);
  if (!parsedList || parsedList.length === 0) {
    throw serviceError('aiParseInvalid', 'No valid change list parsed from LLM output');
  }

  const bookmarkMapById = new Map(bookmarks.map(b => [b.id, b]));
  const bookmarkMapByName = new Map(bookmarks.map(b => [b.name, b]));
  const groupMapById = new Map(groups.map(g => [g.id, g.name]));

  const existingCustomGroupNames = groups
    .filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID)
    .map(g => g.name.trim())
    .filter(Boolean);

  const allProposedChanges = [];

  if (type === 'grouping') {
    for (const item of parsedList) {
      if (!item || typeof item !== 'object') continue;
      const bmId = String(item.bookmarkId || item.id || item.bookmark_id || item.bookmarkID || '').trim();
      const origBm = bookmarkMapById.get(bmId) || bookmarkMapByName.get(String(item.bookmarkName || item.name || '').trim());

      if (origBm) {
        const targetName = extractGroupNameFromItem(item);
        if (!targetName) continue;

        const currentGroupName = groupMapById.get(origBm.groupId) || '';
        const isNew = !existingCustomGroupNames.some(n => n.toLowerCase() === targetName.toLowerCase());

        allProposedChanges.push({
          bookmarkId: origBm.id,
          bookmarkName: origBm.name,
          urls: (origBm.endpoints || []).map(e => e.url),
          currentGroupId: origBm.groupId || UNGROUPED_GROUP_ID,
          currentGroupName,
          suggestedGroupName: targetName,
          isNewGroup: item.isNewGroup !== undefined ? Boolean(item.isNewGroup) : isNew,
          reason: item.reason || '',
          selected: currentGroupName !== targetName
        });
      }
    }
  } else {
    // tagging
    const mode = options.mode || 'append';
    const maxTags = options.maxTagsPerBookmark || 3;

    for (const item of parsedList) {
      if (!item || typeof item !== 'object') continue;
      const bmId = String(item.bookmarkId || item.id || item.bookmark_id || item.bookmarkID || '').trim();
      const origBm = bookmarkMapById.get(bmId) || bookmarkMapByName.get(String(item.bookmarkName || item.name || '').trim());

      if (origBm) {
        const rawTags = extractTagsFromItem(item, maxTags);
        if (rawTags.length === 0) continue;

        const existingTags = Array.isArray(origBm.tags) ? origBm.tags : [];
        let finalTags = [];
        if (mode === 'replace') {
          finalTags = rawTags;
        } else {
          finalTags = Array.from(new Set([...existingTags, ...rawTags]));
        }

        const oldTagStr = existingTags.slice().sort().join(',');
        const newTagStr = finalTags.slice().sort().join(',');
        const hasChange = oldTagStr !== newTagStr;

        allProposedChanges.push({
          bookmarkId: origBm.id,
          bookmarkName: origBm.name,
          urls: (origBm.endpoints || []).map(e => e.url),
          currentTags: existingTags,
          suggestedTags: rawTags,
          finalMergedTags: finalTags,
          mode,
          reason: item.reason || '',
          selected: true
        });
      }
    }
  }

  if (allProposedChanges.length === 0) {
    throw serviceError('aiNoMatch', 'Parsed OK but no current bookmark matched');
  }

  return {
    success: true,
    totalParsed: parsedList.length,
    matchedCount: allProposedChanges.length,
    items: allProposedChanges
  };
}
