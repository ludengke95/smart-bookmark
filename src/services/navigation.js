/**
 * 导航与新页面打开服务
 */

/**
 * 规范化 URL，确保具有合法的网络协议前缀
 * 防止没有协议前缀的内网 IP、端口或域名被浏览器解析为扩展内相对路径 (chrome-extension://<id>/...)
 *
 * @param {string} urlString 原始目标地址
 * @returns {string} 规范化后的绝对网络地址
 */
export function normalizeTargetUrl(urlString) {
  if (!urlString) return '';
  const trimmed = String(urlString).trim();
  if (!trimmed) return '';

  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('chrome:') ||
    trimmed.startsWith('edge:')
  ) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

/**
 * 统一以新页面（新标签页）形式打开指定 URL
 * 优先调用扩展特权 API chrome.tabs.create（完全避免被浏览器弹窗拦截策略阻拦，且在当前窗口后新建标签页），
 * 若不在扩展环境或执行异常，优雅回退至带有 noopener,noreferrer 的 window.open。
 *
 * @param {string} urlString 目标 URL
 * @param {boolean} [active=true] 是否立即聚焦到新创建的页面
 */
export function openInNewTab(urlString, active = true) {
  const finalUrl = normalizeTargetUrl(urlString);
  if (!finalUrl) return;

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    try {
      chrome.tabs.create({ url: finalUrl, active });
      return;
    } catch (e) {
      console.warn('[Navigation] chrome.tabs.create 失败，回退至 window.open:', e);
    }
  }

  const win = window.open(finalUrl, '_blank', 'noopener,noreferrer');
  if (win) {
    win.opener = null;
  }
}
