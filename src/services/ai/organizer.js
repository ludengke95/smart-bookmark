/**
 * AI 智能分组与智能标签流水线编排器 (Pipeline Orchestrator)
 * 纯净通用大模型驱动 (支持 OpenAI / DeepSeek / Ollama / 本地兼容 API)
 */
import { runCustomApiPrompt } from './custom-engine.js';
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';

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
      message: scope === 'ungrouped'
        ? '当前未分组书签为空。如需重新整理全部书签，请在设置中选择「重新整理全部」范围。'
        : '书签列表为空，请先添加或导入书签。',
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

  const systemPrompt = `你是一个专业的浏览器书签语义分析与分类整理助手。
任务：根据用户提供的书签列表（包含ID、名称、URL及端点），为每个书签推荐最合适的分类分组。
规则：
1. 优先归入现有的分类分组列表：[${existingCustomGroupNames.join(', ')}]
2. ${allowNewGroups ? '若现有分组明显不合适，可提议创建简短准确的新分类分组（如"前端开发"、"内网服务"、"设计素材"、"效率办公"、"AI工具"、"学习资料"等，字数2-6字）。' : '严禁创建新分组，必须且只能从上述现有分组中挑选最接近的一个。'}
3. 必须输出严格的 JSON 数组，每个元素包含：
   - bookmarkId: 对应的书签ID (字符串)
   - targetGroupName: 推荐的目标分组名称 (字符串)
   - isNewGroup: 是否为新建分组 (布尔值)
   - reason: 简明归类依据 (10字以内)`;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];
    onProgress({
      phase: 'grouping',
      current: i + 1,
      total: totalChunks,
      percent: Math.round(((i + 1) / totalChunks) * 100),
      message: `正在进行智能分组分析 (${i + 1}/${totalChunks} 批次)...`
    });

    const simplifiedInput = chunk.map(b => ({
      id: b.id,
      name: b.name,
      currentGroup: groupMapById.get(b.groupId) || '未分组',
      urls: (b.endpoints || []).map(ep => ep.url).slice(0, 2)
    }));

    const userPrompt = `请对以下 ${chunk.length} 个书签进行分类整理并输出 JSON 数组：\n${JSON.stringify(simplifiedInput, null, 2)}`;

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

          const currentGroupName = groupMapById.get(origBm.groupId) || '未分组';
          const isNew = !existingCustomGroupNames.some(n => n.toLowerCase() === targetName.toLowerCase());

          allProposedChanges.push({
            bookmarkId: origBm.id,
            bookmarkName: origBm.name,
            urls: (origBm.endpoints || []).map(e => e.url),
            currentGroupId: origBm.groupId || UNGROUPED_GROUP_ID,
            currentGroupName,
            suggestedGroupName: targetName,
            isNewGroup: isNew,
            reason: item.reason || '语义相关',
            selected: currentGroupName !== targetName
          });
        }
      }
    } catch (err) {
      console.error(`第 ${i + 1} 批次智能分组分析失败:`, err);
      throw new Error(`AI 分析中断 (${i + 1}/${totalChunks} 批次): ${err.message}`);
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
      message: scope === 'untagged'
        ? '当前所有书签均已存在标签。如需优化现有标签，请在设置中勾选「优化全部标签」范围。'
        : '书签列表为空，请先添加或导入书签。',
      items: []
    };
  }

  // 2. 分批处理（每批 20 项）
  const BATCH_SIZE = 20;
  const chunks = chunkArray(targetBookmarks, BATCH_SIZE);
  const totalChunks = chunks.length;
  const allProposedChanges = [];

  const systemPrompt = `你是一个专业的浏览器书签元数据提炼专家。
任务：根据书签的名称、URL、内网/外网端点特征，为每个书签提取 1 到 ${maxTags} 个高质量、高概括性的中文标签。
标签提取规则：
1. 标签应涵盖技术栈、业务类别、网络属性或工具属性（如"Vue"、"文档"、"内网运维"、"设计"、"GitHub"、"云原生"等）。
2. 标签应精简短小（2-6个字符），去除无意义的冗余词汇。
3. 必须输出严格的 JSON 数组，每个元素包含：
   - bookmarkId: 对应的书签ID (字符串)
   - suggestedTags: 提炼出的标签字符串数组 (如 ["前端", "工具", "Vue"])
   - reason: 提炼依据 (10字以内)`;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];
    onProgress({
      phase: 'tagging',
      current: i + 1,
      total: totalChunks,
      percent: Math.round(((i + 1) / totalChunks) * 100),
      message: `正在进行智能标签提炼 (${i + 1}/${totalChunks} 批次)...`
    });

    const simplifiedInput = chunk.map(b => ({
      id: b.id,
      name: b.name,
      currentTags: b.tags || [],
      urls: (b.endpoints || []).map(ep => ep.url).slice(0, 2)
    }));

    const userPrompt = `请为以下 ${chunk.length} 个书签提取标签并输出 JSON 数组：\n${JSON.stringify(simplifiedInput, null, 2)}`;

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
            reason: item.reason || '语义提炼',
            selected: true
          });
        }
      }
    } catch (err) {
      console.error(`第 ${i + 1} 批次智能标签分析失败:`, err);
      throw new Error(`AI 标签分析中断 (${i + 1}/${totalChunks} 批次): ${err.message}`);
    }
  }

  return {
    success: true,
    totalAnalyzed: targetBookmarks.length,
    items: allProposedChanges
  };
}
