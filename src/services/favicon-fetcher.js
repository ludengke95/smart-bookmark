/**
 * 跨域 Favicon 抓取、离线品牌图标匹配与 Base64 转换器
 */
import { isPrivateIp } from './xor-matcher.js';

/**
 * 快速离线品牌/关键词图标匹配
 */
export function matchBrandIcon(url = '', name = '') {
  const text = `${url} ${name}`.toLowerCase();
  if (text.includes('gitlab')) return 'gitlab';
  if (text.includes('github')) return 'github';
  if (text.includes('grafana')) return 'grafana';
  if (text.includes('jenkins')) return 'jenkins';
  if (text.includes('docker') || text.includes('portainer') || text.includes('harbor')) return 'docker';
  if (text.includes('kubernetes') || text.includes('k8s') || text.includes('rancher')) return 'kubernetes';
  if (text.includes('prometheus')) return 'prometheus';
  if (text.includes('chatgpt') || text.includes('openai') || text.includes('claude')) return 'chatgpt';
  if (text.includes('confluence') || text.includes('jira') || text.includes('wiki') || text.includes('notion')) return 'confluence';
  if (text.includes('redis')) return 'redis';
  if (text.includes('mysql') || text.includes('mariadb')) return 'mysql';
  return '';
}

async function fetchBlobWithTimeout(url, timeoutMs = 1500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'force-cache'
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob && blob.size > 0 && blob.size <= 250 * 1024) {
      return blob;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 抓取目标网址 Favicon 并转为 Base64
 */
export async function fetchFaviconAsBase64(targetUrl, timeoutMs = 1500) {
  try {
    let cleanUrl = (targetUrl || '').trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }
    const u = new URL(cleanUrl);
    const origin = u.origin;
    const hostname = u.hostname;

    // 1. 尝试直接获取源站 /favicon.ico
    let blob = await fetchBlobWithTimeout(`${origin}/favicon.ico`, timeoutMs);

    // 2. 如果源站获取失败且是公网域名，尝试公共 Favicon API 兜底
    if (!blob && !isPrivateIp(hostname) && hostname.includes('.')) {
      const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
      blob = await fetchBlobWithTimeout(googleFaviconUrl, timeoutMs);
    }

    if (!blob) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result;
        resolve(typeof res === 'string' && res.startsWith('data:') ? res : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

