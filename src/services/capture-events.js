/**
 * Background 采集与地址栏事件注册
 *
 * 将右键上下文菜单、全局快捷键与 Omnibox 三处监听集中注册，
 * 保持 background.js 主体精简。
 */
import { getBookmarks, getProbeCache } from './storage.js';
import {
  captureUrl,
  injectToast,
  i18nMsg,
  isCapturableUrl
} from './capture.js';
import {
  searchBookmarks,
  resolveBookmarkRoute,
  buildSuggestionDescription
} from './omnibox.js';

const MENU_PAGE_ROOT = 'smartbm-page';
const MENU_PAGE_APPEND = 'smartbm-page-append';
const MENU_LINK_SAVE = 'smartbm-link-save';

const OMNIBOX_PREFIX = 'bm:';

/**
 * 注册右键上下文菜单（页面 / 链接）
 * 需在 onInstalled 时创建，避免重复注册。
 */
export function registerContextMenus() {
  if (typeof chrome === 'undefined' || !chrome.contextMenus?.create) return;
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_PAGE_ROOT,
        title: i18nMsg('ctxSavePage'),
        contexts: ['page']
      });
      chrome.contextMenus.create({
        id: MENU_PAGE_APPEND,
        parentId: MENU_PAGE_ROOT,
        title: i18nMsg('ctxAddEndpoint'),
        contexts: ['page']
      });
      chrome.contextMenus.create({
        id: MENU_LINK_SAVE,
        title: i18nMsg('ctxSaveLink'),
        contexts: ['link']
      });
    });
  } catch (e) {
    console.warn('[Capture] contextMenus init warning:', e);
  }
}

/**
 * 处理右键菜单点击
 */
async function handleContextMenuClick(info, tab) {
  const tabId = tab?.id;

  if (info.menuItemId === MENU_LINK_SAVE) {
    const linkUrl = info.linkUrl;
    if (!isCapturableUrl(linkUrl)) {
      injectToast(tabId, i18nMsg('captureFailed', ['invalid']), 'error');
      return;
    }
    const result = await captureUrl({ url: linkUrl, title: info.selectionText || linkUrl });
    const name = result?.bookmark?.name || linkUrl;
    if (result.status === 'saved') {
      injectToast(tabId, i18nMsg('captureSaved', [name]), 'success');
    } else if (result.status === 'exists') {
      injectToast(tabId, i18nMsg('captureSaved', [name]), 'info');
    } else {
      injectToast(tabId, i18nMsg('captureFailed', [result.status]), 'error');
    }
    return;
  }

  if (info.menuItemId === MENU_PAGE_SAVE) {
    const pageUrl = info.pageUrl || tab?.url;
    if (!isCapturableUrl(pageUrl)) {
      injectToast(tabId, i18nMsg('captureFailed', ['invalid']), 'error');
      return;
    }
    const result = await captureUrl({ url: pageUrl, title: info.selectionText || tab?.title || pageUrl });
    const name = result?.bookmark?.name || tab?.title || pageUrl;
    if (result.status === 'saved') {
      injectToast(tabId, i18nMsg('captureSaved', [name]), 'success');
    } else if (result.status === 'exists') {
      // 已收录：同样给出明确反馈，不重复写入
      injectToast(tabId, i18nMsg('captureSaved', [name]), 'info');
    } else {
      injectToast(tabId, i18nMsg('captureFailed', [result.status]), 'error');
    }
    return;
  }

  if (info.menuItemId === MENU_PAGE_APPEND) {
    const pageUrl = info.pageUrl || tab?.url;
    if (!isCapturableUrl(pageUrl)) {
      injectToast(tabId, i18nMsg('captureFailed', ['invalid']), 'error');
      return;
    }
    await openAppendFlow({ url: pageUrl, title: tab?.title || pageUrl, tabId });
  }
}

/**
 * 打开「追加为已有书签备用入口」流程：
 * 通过 session storage 暂存待追加 URL，唤起扩展动作弹窗并进入追加模式；
 * 若当前环境不支持 openPopup，则回退到控制台新标签页。
 */
async function openAppendFlow({ url, title, tabId }) {
  const pending = { url, title, ts: Date.now() };
  try {
    if (chrome.storage?.session?.set) {
      await chrome.storage.session.set({ smartbm_pending_append: pending });
    }
  } catch (e) {
    console.warn('[Capture] session storage set failed:', e);
  }

  // 优先唤起工具栏快捷弹窗（可在其中进入「追加入口」模式）
  if (chrome.action?.openPopup) {
    try {
      await chrome.action.openPopup();
      return;
    } catch (e) {
      console.warn('[Capture] openPopup failed, fallback to console:', e);
    }
  }
  // 回退：打开完整控制台（追加意图通过 query 参数传递）
  try {
    const consoleUrl = chrome.runtime.getURL(
      `/home.html?action=append&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
    );
    await chrome.tabs.create({ url: consoleUrl, active: true });
  } catch (e) {
    console.warn('[Capture] open console failed:', e);
  }
}

/**
 * 注册全局快捷键
 * （快捷收藏使用保留命令 _execute_action 直接打开动作弹窗，
 *   若浏览器预留了自定义命令，也可在此扩展。）
 */
export function registerCommands() {
  if (typeof chrome === 'undefined' || !chrome.commands?.onCommand) return;
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === '_execute_action') {
      if (chrome.action?.openPopup) {
        try {
          await chrome.action.openPopup();
        } catch (e) {
          console.warn('[Capture] command openPopup failed:', e);
        }
      }
    }
  });
}

/**
 * 注册 Omnibox 地址栏集成
 */
export function registerOmnibox() {
  if (typeof chrome === 'undefined' || !chrome.omnibox) return;

  chrome.omnibox.setDefaultSuggestion({ description: i18nMsg('omniboxDescription') });

  chrome.omnibox.onInputStarted?.addListener(() => {
    try {
      chrome.omnibox.setDefaultSuggestion({ description: i18nMsg('omniboxDescription') });
    } catch {
      // ignore
    }
  });

  chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
    try {
      const [bookmarks, cache] = await Promise.all([getBookmarks(), getProbeCache()]);
      const localIp = cache?.localIp || '';
      const probeResults = cache?.results || {};
      const matched = searchBookmarks(bookmarks, text, 8);

      const suggestions = matched.map(bm => {
        const route = resolveBookmarkRoute(bm, localIp, probeResults);
        const optimal = route?.optimal;
        const dimText = optimal?.url || (bm.endpoints?.[0]?.url) || '';
        return {
          content: `${OMNIBOX_PREFIX}${bm.id}`,
          description: buildSuggestionDescription({
            name: bm.name || bm.id,
            route,
            query: text,
            dimText
          })
        };
      });

      suggest(suggestions);
    } catch (e) {
      console.warn('[Omnibox] onInputChanged error:', e);
      suggest([]);
    }
  });

  chrome.omnibox.onInputEntered.addListener(async (content, disposition) => {
    try {
      let targetUrl = '';
      let fallbackQuery = content || '';

      if (content && content.startsWith(OMNIBOX_PREFIX)) {
        const id = content.slice(OMNIBOX_PREFIX.length);
        const [bookmarks, cache] = await Promise.all([getBookmarks(), getProbeCache()]);
        const bm = bookmarks.find(b => String(b.id) === String(id));
        if (bm) {
          const route = resolveBookmarkRoute(bm, cache?.localIp || '', cache?.results || {});
          targetUrl = route?.optimal?.url || '';
          fallbackQuery = bm.name || bm.id;
        }
      } else {
        // 用户未选择建议而直接回车：按输入文本检索最佳匹配，智能寻径直达
        const [bookmarks, cache] = await Promise.all([getBookmarks(), getProbeCache()]);
        const best = searchBookmarks(bookmarks, content, 1)[0];
        if (best) {
          const route = resolveBookmarkRoute(best, cache?.localIp || '', cache?.results || {});
          targetUrl = route?.optimal?.url || '';
        }
      }

      if (!targetUrl) {
        // 无匹配：回退到默认搜索引擎（沿用百度检索）
        targetUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(fallbackQuery || '')}`;
      }

      navigateOmnibox(targetUrl, disposition);
    } catch (e) {
      console.warn('[Omnibox] onInputEntered error:', e);
    }
  });
}

/**
 * 按回车后的窗口处置：当前标签 / 新前台标签 / 新后台标签
 */
function navigateOmnibox(url, disposition) {
  if (!url) return;
  try {
    if (disposition === 'newForegroundTab' && chrome.tabs?.create) {
      chrome.tabs.create({ url, active: true });
    } else if (disposition === 'newBackgroundTab' && chrome.tabs?.create) {
      chrome.tabs.create({ url, active: false });
    } else if (chrome.tabs?.update) {
      chrome.tabs.update({ url });
    } else if (chrome.tabs?.create) {
      chrome.tabs.create({ url, active: true });
    }
  } catch (e) {
    console.warn('[Omnibox] navigate error:', e);
  }
}

/**
 * 统一注册所有采集与地址栏相关监听
 */
export function registerCaptureShortcuts() {
  registerCommands();
  registerOmnibox();
  if (typeof chrome !== 'undefined' && chrome.contextMenus?.onClicked) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      handleContextMenuClick(info, tab).catch(err => {
        console.warn('[Capture] contextMenu handler error:', err);
      });
    });
  }
}
