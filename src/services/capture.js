/**
 * 采集服务 (Capture)
 *
 * 供 Background Service Worker 复用：
 *  - 右键菜单「收藏当前网页 / 收藏此链接」静默保存至未分组
 *  - 若命中已收录入口则去重，避免重复书签
 *  - 通过 chrome.i18n 解析多语言文案，向前台页面注入轻量 Toast 反馈
 */
import { getBookmarks, saveBookmark } from '../services/storage.js';
import { sanitizeUrlForStorage, matchCurrentTabWithBookmarks } from './bookmark-matcher.js';
import { classifyUrl } from './xor-matcher.js';
import { UNGROUPED_GROUP_ID } from '../constants/index.js';

/**
 * 读取当前所有书签（防御性）
 */
async function safeGetBookmarks() {
  try {
    return await getBookmarks();
  } catch (e) {
    console.warn('[Capture] getBookmarks failed:', e);
    return [];
  }
}

/**
 * 判断 URL 是否为可采集的普通网页（排除扩展页、浏览器内部页、空白页）
 * @param {string} url
 */
export function isCapturableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  if (!u) return false;
  return /^https?:\/\//i.test(u);
}

/**
 * 静默收藏一个 URL 至未分组。
 * 若该 URL 已作为某书签的入口存在，则直接判定为「已收录」，不重复写入。
 *
 * @param {{ url: string, title?: string }} payload
 * @returns {Promise<{ status: 'saved'|'exists'|'invalid'|'failed', bookmark?: object, error?: string }>}
 */
export async function captureUrl(payload) {
  const rawUrl = payload?.url;
  if (!isCapturableUrl(rawUrl)) {
    return { status: 'invalid' };
  }
  const cleanUrl = sanitizeUrlForStorage(rawUrl);
  const title = (payload?.title || cleanUrl).trim();

  try {
    const bookmarks = await safeGetBookmarks();
    const { exactMatch } = matchCurrentTabWithBookmarks(cleanUrl, bookmarks);
    if (exactMatch) {
      return { status: 'exists', bookmark: exactMatch };
    }

    const classification = classifyUrl(cleanUrl);
    await saveBookmark({
      name: title || cleanUrl,
      groupId: UNGROUPED_GROUP_ID,
      tags: [],
      endpoints: [{ url: cleanUrl, order: 0, type: classification.type }]
    });
    return { status: 'saved', bookmark: { name: title, url: cleanUrl } };
  } catch (e) {
    console.warn('[Capture] save failed:', e);
    return { status: 'failed', error: e?.message || String(e) };
  }
}

/**
 * 通过 chrome.i18n 获取文案并做占位符替换；在非扩展环境下优雅回退。
 * @param {string} key messages.json 中的键
 * @param {string[]} [subs] 占位符替换值 (对应 $1..$9 或 {name}/{reason})
 */
export function i18nMsg(key, subs = []) {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
      const msg = chrome.i18n.getMessage(key, subs);
      if (msg) return msg;
    }
  } catch {
    // ignore
  }
  // 极简兜底：返回键名，避免抛错
  return key;
}

/**
 * 在指定标签页注入一个自动淡出的轻量 Toast（不依赖任何页面框架）。
 * @param {number} tabId
 * @param {string} text
 * @param {'success'|'error'|'info'} [tone]
 */
export function injectToast(tabId, text, tone = 'success') {
  if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript || typeof tabId !== 'number') {
    return;
  }
  const bg = tone === 'error'
    ? 'linear-gradient(135deg,#ef4444,#dc2626)'
    : tone === 'info'
      ? 'linear-gradient(135deg,#3b82f6,#2563eb)'
      : 'linear-gradient(135deg,#22c55e,#16a34a)';
  const icon = tone === 'error' ? '✕' : tone === 'info' ? 'ℹ' : '✓';
  const payload = { text, bg, icon };

  chrome.scripting.executeScript({
    target: { tabId },
    func: (p) => {
      try {
        const OLD = '__smartBookmarkCaptureToast';
        const old = document.getElementById(OLD);
        if (old) old.remove();

        const wrap = document.createElement('div');
        wrap.id = OLD;
        wrap.setAttribute('role', 'status');
        wrap.style.cssText = [
          'position:fixed',
          'top:20px',
          'right:20px',
          'z-index:2147483647',
          'display:flex',
          'align-items:center',
          'gap:8px',
          'max-width:320px',
          'padding:10px 14px',
          'border-radius:12px',
          `background:${p.bg}`,
          'color:#fff',
          'font:600 13px/1.4 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif',
          'box-shadow:0 8px 24px rgba(0,0,0,0.18)',
          'opacity:0',
          'transform:translateY(-8px)',
          'transition:opacity .22s ease,transform .22s ease',
          'pointer-events:none'
        ].join(';');

        const badge = document.createElement('span');
        badge.textContent = p.icon;
        badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9999px;background:rgba(255,255,255,0.22);font-size:11px;flex:0 0 auto;';

        const label = document.createElement('span');
        label.textContent = p.text;
        label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

        wrap.appendChild(badge);
        wrap.appendChild(label);
        document.documentElement.appendChild(wrap);

        requestAnimationFrame(() => {
          wrap.style.opacity = '1';
          wrap.style.transform = 'translateY(0)';
        });
        setTimeout(() => {
          wrap.style.opacity = '0';
          wrap.style.transform = 'translateY(-8px)';
          setTimeout(() => wrap.remove(), 260);
        }, 2200);
      } catch {
        // 页面受限（如 chrome:// 或 CSP）时静默失败
      }
    },
    args: [payload]
  }).catch(() => {});
}
