# MCP 书签治理删除问题分析与标签系统体验优化方案

本文档针对 **WorkBuddy 在使用 MCP 进行标签与分组治理删除时遇到的核心问题** 进行全链路根因溯源与分析，并对后续 **标签热度频次排序算法** 及 **主页标签栏单行折叠与展开交互** 给出完整的技术实现方案。

---

## 一、WorkBuddy 在使用 MCP 删除时的现象与根因剖析

### 1.1 问题现象记录与认知偏差

在 `smart-bookmark-mcp-reference.md` 与 WorkBuddy 工作日志中，记录了以下典型场景与推断：

1. **“读写最终一致性”假象**：
   WorkBuddy 在对 32 个空壳旧分组进行串行批量删除时，每次调用 `delete_group` 接口出参均返回 `{ success: true, ... }`，但紧接着调用 `get_groups` 查询，发现被删除的分组依然存在于列表中；多次重复删除后，旧分组在一段时间内又“逐波消失”。
2. **“删除需要滞后幂等补发”结论**：
   WorkBuddy 误以为系统内部存在不可见的异步刷新或写入传播延迟，推导出“写侧与读侧滞后”的结论，进而在阶段三针对已删除的 ID 进行了 21 次重复补发删除调用。
3. **`list_bookmarks` 传输爆炸**：
   300 条书签全量导出时因包含超大的 Base64 网页离线图标（`customIconBase64`），返回体积超过数兆字节导致大模型上下文被截断溢出。

---

### 1.2 根本原因深度溯源

经过对历史提交链路（Commit `32c3df8`、`05eb88f`、`c066a30`）及底层架构的全方位审计，该现象的本质是 **“双进程并发竞争下的前台内存脏写覆盖 (Lost-Update)”**，并非存储引擎真正的延迟广播。

```
┌─────────────────────────────────────────────────────────────┐
│ 外部 AI 客户端 (WorkBuddy / Cursor)                          │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON-RPC (stdio)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Node.js 桥接进程: mcp-bridge.js                             │
└──────────────┬──────────────────────────────┬───────────────┘
               │ ws://127.0.0.1:8333 (Entry 1)│ ws://127.0.0.1:8333 (Entry 2)
               ▼                              ▼
  ┌─────────────────────────┐    ┌─────────────────────────┐
  │ 后台 Service Worker     │    │ 前台页面 (App.svelte)   │
  │ (background.js)         │    │ 单例 appState 响应式状态 │
  └────────────┬────────────┘    └────────────┬────────────┘
               │                              │
               │ ① delete_group / delete_tag  │ ② 前台定时探测/点击统计
               │    写入 storage.local (新数据)│    旧内存写回 storage.local
               │                              │    (致命冲掉后台删除成果)
               ▼                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │              chrome.storage.local 持久层                 │
  └──────────────────────────────────────────────────────────┘
```

#### 根因 1：前台页面未监听 Storage 变更导致旧内存脏覆盖（致命点）
- 当 WorkBuddy 通过 MCP 触发 `delete_group` 或 `delete_tag` 时，请求由 **Service Worker（后台）** 接收并执行。后台确实成功将数据从 `chrome.storage.local` 中剔除并持久化；
- 然而此时用户的浏览器正开启着前端标签页（`App.svelte`），前台的单例 `appState` 在早期版本中**没有监听 `chrome.storage.onChanged`** 事件；
- 前台定时运行网络可达性探测缓存（`saveProbeCache`）、图标抓取、书签点击统计（`recordClick`）等任务，前台持有的仍然是**包含已删分组/标签的旧内存副本**；
- 一旦前台发生任何状态写回，旧内存就会瞬间覆盖底层的 `smart_bm_groups` 或 `smart_bm_list`，将被删除的分组/标签“复活”，表现为刚删掉的分组过几秒又重新出现。

#### 根因 2：复合读-改-写（Read-Modify-Write）缺乏事务互斥锁
- 在早期的 `deleteGroup` / `deleteTag` 实现中，均直接采用 `const current = await getStorageData(); ... await setStorageData(current)`；
- 在批量分批或多动作快速连续调用时，多个并行的读-改-写动作在异步上下文中交叉穿插，发生经典的并发竞争（Race Condition），后提交的事务读取了旧快照，从而冲刷丢失了前面的删除操作。

#### 根因 3：大字段缺少精简检索投影
- `list_bookmarks` MCP 工具在设计之初未考虑大模型上下文窗口的 Token 承载限制，直接将完整的 `customIconBase64`、`endpoints` 原样序列化，导致大批次调用时 payload 暴增。

---

### 1.3 治理成效与巩固方案

在 Commit `05eb88f` 中，我们已经落实了底层修复：
1. **引入 Storage 事务全局串行锁**（`withStorageLock`）：所有读-改-写操作按严格 FIFO 队列原子执行，彻底解决并发踩踏；
2. **前台双向联动拉取**（`setupStorageListener`）：在 `App.svelte` 初始化时订阅 `chrome.storage.onChanged`，一旦后台 Service Worker 完成写库，前台自动拉取最新数据，坚决杜绝脏缓存回写覆盖。

**后续巩固建议**：
- 在 `src/services/mcp/client.js` 的 `list_bookmarks` 工具定义中增加 `includeIcons: false` 参数（默认不返回 Base64 图标），大幅缩减 90% 以上的数据体积，从根源避免大模型上下文溢出与截断。

---

## 二、标签排序体验升级：基于使用频次与点击热度的综合排序

### 2.1 需求说明与业务价值
用户希望标签的展示顺序能够动态体现使用热度，**被点击与使用越频繁的标签排在越前面**，让核心高频使用的标签触手可及，提升分类浏览效率。

### 2.2 算法模型设计

目前标签的频次统计主要依赖挂载的书签数量。为了更精准体现“使用次数”，我们将构建**标签综合热度权重模型 (Tag Heat Score)**：

$$\text{HeatScore}(tag) = (\text{TotalClicks} \times W_{click}) + (\text{BookmarkCount} \times W_{count})$$

- **$\text{TotalClicks}$ (点击热度)**：该标签所标记的书签在近期（30 天）内累计被点击的总次数；
- **$\text{BookmarkCount}$ (覆盖基数)**：拥有该标签的书签总数；
- **排序权重**：$W_{click} = 10$，$W_{count} = 1$。
- **排序规则**：
  1. 优先按照 $\text{HeatScore}$ 从大到小降序排列；
  2. 若热度相同，则按标签下书签数量 $\text{BookmarkCount}$ 降序；
  3. 若仍相同，按标签字符自然拼音顺序升序排列（确保确定性视图）。

### 2.3 核心代码改造点 (`src/state/app.svelte.js`)

在 `AppState` 的 `allTags` 派生计算（Runes `$derived.by`）中强化排序逻辑：

```javascript
// 派生状态：所有标签及频次统计 (按点击与使用热度综合降序)
allTags = $derived.by(() => {
  const tagCountMap = {};
  const tagClickMap = {};

  for (const bm of this.bookmarks) {
    const clicks = this.clickStats[bm.id] || 0;
    for (const tag of (bm.tags || [])) {
      tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
      tagClickMap[tag] = (tagClickMap[tag] || 0) + clicks;
    }
  }

  return Object.keys(tagCountMap).map(tag => {
    const count = tagCountMap[tag];
    const clickCount = tagClickMap[tag] || 0;
    // 综合热度分：点击权重 10 + 关联书签数 1
    const score = clickCount * 10 + count;
    return {
      name: tag,
      count,
      clickCount,
      score
    };
  }).sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name));
});
```

同时，保持 `src/services/storage/group.js` 中的 `getAllTagsWithCount()` 与此排序规则完全同步，保证 MCP 端查询（`get_tags`）与前台视图展现完全一致。

---

## 三、主页标签栏交互升级：单行截断 + 行末平滑折叠/展开全部

### 3.1 现状与痛点

在 Commit `c066a30` 中，为了避免标签过多撑高首屏，页面限制了标签栏的高度：
```svelte
<div class="flex flex-wrap items-center content-start gap-1.5 flex-1 min-w-0 h-[26px] py-[1px] overflow-hidden">
```
这种做法虽然控制了首屏高度，但是排在第一行之外的标签被完全遮挡截断，用户无法发现、筛选和使用隐藏的标签。

### 3.2 交互与视觉设计方案

1. **常驻状态（默认收起）**：
   - 标签容器保持高度 `max-h-[30px] overflow-hidden`，在主页上仅占据精巧的一行空间；
   - 在标签行末尾（书签排序下拉菜单左侧）展示一个轻量折叠切换按钮：
     - 未展开时显示**向下展开小箭头（Chevron Down）**，并带 Tooltip（`展开所有标签`）；
     - 图标右侧可辅以紧凑提示或纯图标样式，避免占用过多横向宽度。
2. **展开状态（全部呈现）**：
   - 点击箭头按钮后，局部切换为 `isExpanded = true`；
   - 容器高度自适应伸展（`max-h-none` 或平滑过渡），所有标签以 `flex-wrap` 自然多行排布；
   - 箭头图标平滑旋转 180° 变为**向上收起小箭头（Chevron Up）**，Tooltip 切换为 `收起标签栏`；
   - 再次点击或点击“全部”重置时可便捷收起。
3. **视觉风格与规范契合**：
   - 完全使用 Design Token（`text-text-secondary hover:text-text-primary hover:bg-subtle border-border-subtle`）；
   - 响应式适配：在屏幕较窄时自适应换行，在仅有一行甚至极少标签（无溢出）时保持优雅视觉对齐。

### 3.3 组件实现方案 (`src/components/newtab/TagPills.svelte`)

#### 结构与逻辑设计：

```svelte
<script>
  import { appState } from '../../state/app.svelte.js';
  import { BOOKMARK_SORT_OPTIONS } from '../../constants/index.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';

  let showSortMenu = $state(false);
  let isExpanded = $state(false); // 控制标签多行展开/收起

  let currentSort = $derived(
    BOOKMARK_SORT_OPTIONS.find(opt => opt.value === (appState.settings.bookmarkSortOrder || 'custom')) || BOOKMARK_SORT_OPTIONS[0]
  );

  function getSortLabel(value) {
    return t(`sort.${value}`, {}, currentSort.label);
  }

  function handleSelectSort(sortVal) {
    appState.setBookmarkSortOrder(sortVal);
    showSortMenu = false;
    const label = getSortLabel(sortVal);
    toast.show(t('sort.toastSorted', { label }));
  }
</script>

{#if appState.bookmarks.length > 0}
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-start justify-between gap-2.5 select-none">
    <!-- 标签筛选胶囊区 -->
    <nav aria-label={t('nav.tagFilter')} class="flex items-start gap-1.5 flex-1 min-w-0">
      <button
        type="button"
        onclick={() => (appState.activeTag = 'all')}
        class="flex-shrink-0 px-3 py-1 rounded-full text-xs transition-all {appState.activeTag === 'all'
          ? 'bg-accent text-accent-fg font-medium shadow-sm'
          : 'text-text-secondary hover:text-text-primary hover:bg-subtle'}"
      >
        {t('common.all')} ({appState.bookmarks.length})
      </button>

      {#if appState.allTags.length > 0}
        <div class="flex flex-wrap items-center content-start gap-1.5 flex-1 min-w-0 transition-all duration-200 {isExpanded ? 'h-auto py-[1px]' : 'h-[28px] py-[1px] overflow-hidden'}">
          {#each appState.allTags as tag}
            <button
              type="button"
              onclick={() => (appState.activeTag = appState.activeTag === tag.name ? 'all' : tag.name)}
              class="flex-shrink-0 px-3 py-1 rounded-full text-xs transition-all flex items-center gap-1 {appState.activeTag === tag.name
                ? 'bg-accent text-accent-fg font-medium shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-subtle'}"
            >
              <span>{tag.name}</span>
              <span class="opacity-60 text-[10px] font-mono">({tag.count})</span>
            </button>
          {/each}
        </div>

        <!-- 展开/收起切换箭头按钮 -->
        <button
          type="button"
          onclick={() => (isExpanded = !isExpanded)}
          class="flex-shrink-0 p-1.5 mt-0.5 rounded-lg border border-border-subtle/70 bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          title={isExpanded ? t('tags.collapseAll') : t('tags.expandAll')}
          aria-label={isExpanded ? t('tags.collapseAll') : t('tags.expandAll')}
        >
          <svg class="w-3.5 h-3.5 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      {/if}
    </nav>

    <!-- 排序规则下拉切换器 -->
    <div class="relative flex-shrink-0 mt-0.5">
      ...
    </div>
  </div>
{/if}
```

---

## 四、实施计划与风险评估

| 阶段 | 改造任务 | 影响范围 | 风险评估与防范 |
|---|---|---|---|
| **第一阶段** | 算法升级：强化 `allTags` 与 `getAllTagsWithCount` 综合热度排序 | `app.svelte.js`、`group.js` | **无风险**。纯排序比较器调整，不改变任何数据持久化结构。 |
| **第二阶段** | 界面升级：`TagPills.svelte` 增加展开/折叠箭头与状态切换 | `TagPills.svelte`、多语言字典 | **极低**。保证单行收起时的截断高度严丝合缝，展开时自适应自然换行，不影响下方书签网格的正常渲染。 |
| **第三阶段** | 多语言文案补充：增加展开与收起的提示词 | `src/i18n/locales/*` | **无风险**。按中英文对照规整。 |
| **第四阶段** | 冒烟验证与回归测试 | 手动与已有脚本 | 运行核心逻辑与构建检查（`npm run compile`）。 |

---

## 五、方案结语

本方案从根本上厘清了 WorkBuddy 在治理过程中遭遇的“写侧滞后”实质是双端并发时的前台旧缓存脏覆盖，同时给出了标签按热度权重优先排序的科学数学规则，以及标签栏单行美观与全量展开浏览兼得的高效交互实现。方案已就绪，待用户审批同意后即可落地实施。
