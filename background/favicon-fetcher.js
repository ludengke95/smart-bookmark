/**
 * 跨域 Favicon 抓取与 Base64 转换器
 */

export async function fetchFaviconAsBase64(targetUrl) {
  try {
    let cleanUrl = targetUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }
    const origin = new URL(cleanUrl).origin;
    const faviconUrl = `${origin}/favicon.ico`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(faviconUrl, {
      signal: controller.signal,
      cache: 'force-cache'
    });
    clearTimeout(timer);

    if (!response.ok) return null;

    const blob = await response.blob();
    // 限制 favicon 体积避免 storage 超限
    if (blob.size > 200 * 1024) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
