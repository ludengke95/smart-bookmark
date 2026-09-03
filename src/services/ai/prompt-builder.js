/**
 * 提示词与精简书签数据生成工具 (Prompt & Data Builder)
 * 提示词与数据分离：提示词仅包含规则与格式规范，数据单独导出
 */
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';

/**
 * 1. 生成智能分组 Prompt (纯提示词) 与 精简书签数据
 */
export function generateGroupingPromptAndData({
  bookmarks = [],
  groups = [],
  scope = 'ungrouped',
  allowNewGroups = true
}) {
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
    currentGroup: groupMapById.get(b.groupId) || '未分组',
    urls: (b.endpoints || []).map(ep => ep.url).slice(0, 2)
  }));

  // 4. 构造纯规则提示词 (不塞入数据本体)
  const existingGroupsText = existingCustomGroupNames.length > 0
    ? existingCustomGroupNames.join('、')
    : '暂无已有自定义分组';

  const newGroupRule = allowNewGroups
    ? '若现有分组明显不合适，可提议创建简短准确的新分类分组（如"前端开发"、"内网服务"、"设计素材"、"效率办公"、"AI工具"、"学习资料"等，字数2-6字）。'
    : '严禁创建新分组，必须且只能从现有可用分组中挑选最接近的一个。';

  const promptText = `你是一个专业的浏览器书签语义分析与分类整理助手。
任务：请根据我提供的书签数据列表（包含ID、名称、当前分组及URL），为每个书签推荐最合适的目标分组。

【现有可用分组】
${existingGroupsText}

【分类规则】
1. 优先归入现有的可用分组。
2. ${newGroupRule}
3. 必须输出严格的 JSON 数组（可以用 \`\`\`json 代码块包裹），不要输出多余的寒暄与解释。

【输出 JSON 格式规范】
[
  {
    "bookmarkId": "对应的书签ID (保持原样)",
    "targetGroupName": "推荐的目标分组名称",
    "isNewGroup": false,
    "reason": "简明归类依据 (10字以内)"
  }
]`;

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

  const modeDesc = mode === 'replace'
    ? '全新提炼 1 到 ' + maxTags + ' 个最精准的标签，将覆盖原有标签'
    : '提炼 1 到 ' + maxTags + ' 个补充标签';

  const promptText = `你是一个专业的浏览器书签元数据提炼专家。
任务：请根据我提供的书签数据列表，为每个书签${modeDesc}。

【标签提炼规则】
1. 标签应涵盖技术栈、业务类别、网络属性或工具属性（如"Vue"、"文档"、"内网运维"、"设计"、"GitHub"、"云原生"等）。
2. 标签应精炼短小（2-6个字符），去除无意义的冗余词汇。
3. 必须输出严格的 JSON 数组（可以用 \`\`\`json 代码块包裹），不要输出多余的寒暄与解释。

【输出 JSON 格式规范】
[
  {
    "bookmarkId": "对应的书签ID (保持原样)",
    "suggestedTags": ["标签1", "标签2"],
    "reason": "提炼依据 (10字以内)"
  }
]`;

  return {
    promptText,
    simplifiedBookmarks,
    count: simplifiedBookmarks.length
  };
}
