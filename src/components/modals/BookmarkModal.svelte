<script>
  import { appState } from '../../state/app.svelte.js';
  import { classifyUrl } from '../../services/xor-matcher.js';
  import { fetchFaviconAsBase64 } from '../../services/favicon-fetcher.js';
  import { probeSingleUrl } from '../../services/ping-probe.js';
  import { BRAND_ICONS } from '../../services/icons-library.js';
  import { toast } from '../../state/toast.svelte.js';
  import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
  import IconRender from '../common/IconRender.svelte';
  import Select from '../common/Select.svelte';

  let { open = $bindable(false), editBookmark = null, defaultGroupId = '' } = $props();

  let name = $state('');
  let groupId = $state('');
  let tagsInput = $state('');
  let iconKey = $state('');
  let customIconBase64 = $state('');
  let endpoints = $state([{ url: '', order: 0 }]);
  let isProbing = $state({});
  let showIconPicker = $state(false);

  // 过滤掉常用分组（常用为自动统计计算的分组，物理归属为具体自定义分组或未分组）
  const selectableGroups = $derived(
    appState.groups.filter(g => g.id !== PINNED_GROUP_ID)
  );

  const groupOptions = $derived(
    selectableGroups.map(g => ({
      value: g.id,
      label: g.name,
      iconText: g.id === UNGROUPED_GROUP_ID ? '📄' : '📁'
    }))
  );

  $effect(() => {
    if (open) {
      const fallbackGroupId = selectableGroups[0]?.id || UNGROUPED_GROUP_ID;
      if (editBookmark) {
        name = editBookmark.name || '';
        groupId = (editBookmark.groupId && editBookmark.groupId !== PINNED_GROUP_ID)
          ? editBookmark.groupId
          : fallbackGroupId;
        tagsInput = (editBookmark.tags || []).join(', ');
        iconKey = editBookmark.iconKey || '';
        customIconBase64 = editBookmark.customIconBase64 || '';
        endpoints = (editBookmark.endpoints || []).length > 0
          ? JSON.parse(JSON.stringify(editBookmark.endpoints))
          : [{ url: '', order: 0 }];
      } else {
        name = '';
        groupId = (defaultGroupId && defaultGroupId !== PINNED_GROUP_ID)
          ? defaultGroupId
          : fallbackGroupId;
        tagsInput = '';
        iconKey = '';
        customIconBase64 = '';
        endpoints = [{ url: '', order: 0 }];
      }
      isProbing = {};
      showIconPicker = false;
    }
  });

  function addEndpoint() {
    endpoints.push({ url: '', order: endpoints.length });
  }

  function removeEndpoint(idx) {
    if (endpoints.length <= 1) {
      endpoints[0].url = '';
      return;
    }
    endpoints.splice(idx, 1);
  }

  async function handleUrlBlur(idx) {
    const url = endpoints[idx]?.url?.trim();
    if (!url) return;

    // 如果未设置名称且是第一个入口，自动解析域名作为默认名称
    if (!name && idx === 0) {
      try {
        const u = new URL(url.startsWith('http') ? url : 'http://' + url);
        name = u.hostname;
      } catch {}
    }

    // 如果未设置自定义图标且未选择品牌图标，尝试自动抓取 Favicon
    if (!iconKey && !customIconBase64 && idx === 0) {
      fetchFaviconAsBase64(url).then(b64 => {
        if (b64) customIconBase64 = b64;
      });
    }
  }

  async function testProbe(url) {
    if (!url) return;
    isProbing[url] = 'testing';
    const res = await probeSingleUrl(url, 2000);
    isProbing[url] = res.reachable ? `${res.latency}ms` : '不可达';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      toast.show('请输入书签名称');
      return;
    }

    const cleanEndpoints = endpoints
      .map((ep, i) => {
        let u = (ep.url || '').trim();
        if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
          u = 'http://' + u;
        }
        return {
          url: u,
          order: i,
          type: classifyUrl(u).type
        };
      })
      .filter(ep => !!ep.url);

    if (cleanEndpoints.length === 0) {
      toast.show('请至少配置一个有效的访问 URL');
      return;
    }

    const parsedTags = tagsInput
      .split(/[,，]/)
      .map(t => t.trim())
      .filter(Boolean);

    const payload = {
      id: editBookmark ? editBookmark.id : undefined,
      name: name.trim(),
      groupId: groupId || UNGROUPED_GROUP_ID,
      tags: parsedTags,
      iconKey,
      customIconBase64,
      endpoints: cleanEndpoints
    };

    await appState.saveBookmark(payload);
    toast.show(editBookmark ? '已保存书签修改' : '已添加新书签');
    open = false;
  }
</script>

{#if open}
  <!-- 模态遮罩层 -->
  <div
    class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
    onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
  >
    <div class="w-full max-w-lg h-[530px] bg-surface border border-border-subtle rounded-xl shadow-popover p-5 space-y-4 flex flex-col">
      <!-- 头部 -->
      <div class="flex items-center justify-between pb-2 border-b border-border-subtle flex-shrink-0">
        <h2 class="text-sm font-semibold text-text-primary">
          {editBookmark ? '编辑书签' : '添加新书签'}
        </h2>
        <button
          type="button"
          onclick={() => (open = false)}
          class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="关闭对话框"
          title="关闭"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 表单主体 (内容滚动区 + 固定底部) -->
      <form onsubmit={handleSubmit} class="flex-1 flex flex-col min-h-0 text-xs">
        <div class="flex-1 overflow-y-auto space-y-4 pr-1">
          <!-- 名称与图标选择 -->
          <div class="flex items-start gap-3">
            <!-- 图标预览与选择器触发 -->
            <div class="flex flex-col items-center gap-1">
              <button
                type="button"
                onclick={() => (showIconPicker = !showIconPicker)}
                class="w-10 h-10 rounded-lg bg-subtle border border-border-subtle hover:border-border-focus flex items-center justify-center transition-colors overflow-hidden"
                title="点击更换图标"
              >
                <IconRender {iconKey} customIcon={customIconBase64} size={32} />
              </button>
              <span class="text-[10px] text-text-tertiary">换图标</span>
            </div>

            <!-- 书签名称 -->
            <div class="flex-1 space-y-1">
              <label for="bm-modal-name" class="block font-medium text-text-secondary">书签名称 *</label>
              <input
                id="bm-modal-name"
                type="text"
                bind:value={name}
                placeholder="如：GitLab 代码平台"
                class="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle focus:border-border-focus outline-none text-text-primary"
                required
              />
            </div>
          </div>

          <!-- 极简图标选择面板 -->
          {#if showIconPicker}
            <div class="p-3 rounded-lg bg-subtle border border-border-subtle space-y-2">
              <div class="flex items-center justify-between text-[11px] text-text-secondary">
                <span>选择品牌图标</span>
                <button
                  type="button"
                  onclick={() => { iconKey = ''; customIconBase64 = ''; showIconPicker = false; }}
                  class="text-accent underline"
                >
                  使用默认
                </button>
              </div>
              <div class="grid grid-cols-6 gap-2">
                {#each Object.entries(BRAND_ICONS) as [k, val]}
                  <button
                    type="button"
                    onclick={() => { iconKey = k; customIconBase64 = ''; showIconPicker = false; }}
                    class="p-2 rounded-md hover:bg-surface flex flex-col items-center gap-1 transition-colors {iconKey === k ? 'bg-surface border border-border-focus' : ''}"
                    title={val.name}
                  >
                    <div class="w-4 h-4" style="color: {val.color || 'currentColor'}">
                      {@html val.svg}
                    </div>
                    <span class="text-[9px] text-text-tertiary truncate max-w-[40px]">{val.name}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- 所属分组与标签 -->
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <span class="block font-medium text-text-secondary">所属分组</span>
              <Select
                options={groupOptions}
                bind:value={groupId}
              />
            </div>

            <div class="space-y-1">
              <label for="bm-modal-tags" class="block font-medium text-text-secondary">标签 (逗号分隔)</label>
              <input
                id="bm-modal-tags"
                type="text"
                bind:value={tagsInput}
                placeholder="如：代码仓库, CI/CD"
                class="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle focus:border-border-focus outline-none text-text-primary"
              />
            </div>
          </div>

          <!-- 多访问入口 (Endpoints) -->
          <div class="space-y-2 pt-2">
            <div class="flex items-center justify-between">
              <span class="font-medium text-text-secondary">访问入口列表 (多地址智能寻径)</span>
              <button
                type="button"
                onclick={addEndpoint}
                class="text-xs text-accent font-medium hover:underline flex items-center gap-1"
              >
                <span>+ 添加入口</span>
              </button>
            </div>

            <div class="space-y-2">
              {#each endpoints as ep, idx}
                {@const classification = classifyUrl(ep.url)}
                <div class="flex items-center gap-2">
                  <!-- 网络类型指示徽章 -->
                  <span
                    class="px-1.5 py-1 rounded text-[10px] font-mono flex-shrink-0 {classification.isIntranet
                      ? 'bg-status-intranet/10 text-status-intranet border border-status-intranet/20'
                      : 'bg-status-extranet/10 text-status-extranet border border-status-extranet/20'}"
                  >
                    {classification.isIntranet ? '内网' : '外网'}
                  </span>

                  <!-- URL 输入框 -->
                  <input
                    type="text"
                    bind:value={ep.url}
                    onblur={() => handleUrlBlur(idx)}
                    placeholder="如: http://192.168.10.50:8080"
                    class="flex-1 px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle focus:border-border-focus outline-none font-mono text-xs text-text-primary"
                  />

                  <!-- 测速探测按钮 -->
                  <button
                    type="button"
                    onclick={() => testProbe(ep.url)}
                    class="px-2 py-1 rounded border border-border-subtle hover:bg-subtle text-[10px] font-mono text-text-secondary flex-shrink-0"
                    title="测试该入口当前延迟"
                  >
                    {isProbing[ep.url] || '测速'}
                  </button>

                  <!-- 删除入口行 -->
                  <button
                    type="button"
                    onclick={() => removeEndpoint(idx)}
                    class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-status-danger transition-colors flex-shrink-0"
                    title="删除该行"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- 底部操作按钮 (固定于底部) -->
        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle flex-shrink-0 mt-3">
          <button
            type="button"
            onclick={() => (open = false)}
            class="px-4 py-2 rounded-lg border border-border-subtle hover:bg-subtle font-medium text-text-secondary transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            class="px-4 py-2 rounded-lg bg-accent text-accent-fg font-medium shadow-sm hover:opacity-90 transition-opacity"
          >
            保存书签
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
