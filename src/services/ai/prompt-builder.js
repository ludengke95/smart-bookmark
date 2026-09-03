/**
 * 提示词与精简书签数据生成工具 (Prompt & Data Builder)
 * 提示词与数据分离：提示词仅包含规则与格式规范，数据单独导出
 * 所有指令文本取自 aiPrompt.* 语言包，随当前界面语言渲染
 */
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
import { t } from '../../i18n/index.svelte.js';

/**
 * 1. 生成智能分组 Prompt (纯提示词) 与 精简书签数据
 */
export function generateGroupingPromptAndData({
  bookmarks = [],
  groups = [],
  scope = 'ungrouped',
  allowNewGroups = true
}) {
  const ungroupedLabel = t('aiPrompt.ungrouped');
  const listSeparator = t('aiPrompt.listSeparator');

  // 1. 过滤目标书签
  let targetBookmarks = [];
  if (scope === 'ungrouped') {
    targetBookmarks = bookmarks.filter(b => !b.groupId || b.groupId === UNGROUPED_GROUP_ID);
  } else {
    targetBookmarks = [...bookmarks];
  }

  // 2. 收集已有自定义分组名称
  const existingCustomGroupNames = groups
    .filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID)
    .map(g => g.name.trim())
    .filter(Boolean);

  const groupMapById = new Map(groups.map(g => [g.id, g.name]));

  // 3. 构造精简书签数据列表 (用于单独下载)
  const simplifiedBookmarks = targetBookmarks.map(b => ({
    id: b.id,
    name: b.name,
    currentGroup: groupMapById.get(b.groupId) || ungroupedLabel,
    urls: (b.endpoints || []).map(ep => ep.url).slice(0, 2)
  }));

  // 4. 构造纯规则提示词 (不塞入数据本体)
  const existingGroupsText = existingCustomGroupNames.length > 0
    ? existingCustomGroupNames.join(listSeparator)
    : t('aiPrompt.noCustomGroups');

  const promptText = t('aiPrompt.manualGrouping', {
    groups: existingGroupsText,
    rule: allowNewGroups ? t('aiPrompt.groupRuleAllowNew') : t('aiPrompt.groupRuleForbidNew')
  });

  return {
    promptText,
    simplifiedBookmarks,
    count: simplifiedBookmarks.length
  };
}

/**
 * 2. 生成智能标签提炼 Prompt (纯提示词) 与 精简书签数据
 */
export function generateTaggingPromptAndData({
  bookmarks = [],
  scope = 'untagged',
  mode = 'append',
  maxTags = 3
}) {
  // 1. 过滤目标书签
  let targetBookmarks = [];
  if (scope === 'untagged') {
    targetBookmarks = bookmarks.filter(b => !Array.isArray(b.tags) || b.tags.length === 0);
  } else {
    targetBookmarks = [...bookmarks];
  }

  // 2. 构造精简书签数据列表 (用于单独下载)
  const simplifiedBookmarks = targetBookmarks.map(b => ({
    id: b.id,
    name: b.name,
    currentTags: b.tags || [],
    urls: (b.endpoints || []).map(ep => ep.url).slice(0, 2)
  }));

  const taskSentence = mode === 'replace'
    ? t('aiPrompt.taskReplace', { maxTags })
    : t('aiPrompt.taskAppend', { maxTags });

  const promptText = t('aiPrompt.manualTagging', { task: taskSentence });

  return {
    promptText,
    simplifiedBookmarks,
    count: simplifiedBookmarks.length
  };
}
