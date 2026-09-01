/**
 * 离线矢量图标库 (Simple Icons 品牌库 + 丰富技术栈图标) 与远程 Iconify 引擎
 */
import { getRemoteIconCache, setRemoteIconCache } from './storage.js';

export const BRAND_ICONS = {
  gitlab: {
    name: 'GitLab',
    color: '#FC6D26',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.423-.73-.423-.867 0L16.418 9.45H7.582L4.919 1.263C4.783.84 4.188.84 4.052 1.263L1.388 9.452.045 13.587c-.121.375.014.787.33 1.023l11.096 8.046a.881.881 0 001.056 0l11.097-8.046c.318-.236.453-.648.332-1.023"/></svg>`
  },
  github: {
    name: 'GitHub',
    color: '#A855F7',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`
  },
  grafana: {
    name: 'Grafana',
    color: '#F59E0B',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.25 15.5c-.75 2.1-2.4 3.75-4.5 4.5-.6.2-1.2.3-1.8.3-.4 0-.8-.1-1.2-.2-1.6-.5-2.8-1.6-3.4-3.1-.4-1-.4-2 0-3 .5-1.3 1.5-2.3 2.8-2.8.9-.4 1.9-.4 2.8 0 1.3.5 2.3 1.5 2.8 2.8.4.8.5 1.5.5 1.5zm-8.25-11c4.5 0 8.2 3.4 8.7 7.8-.5-.5-1.1-.9-1.8-1.2-1.2-.5-2.5-.5-3.7 0-1.8.7-3.2 2.1-3.9 3.9-.5 1.2-.5 2.5 0 3.7.3.7.7 1.3 1.2 1.8-4.4-.5-7.8-4.2-7.8-8.7 0-4.8 3.9-8.7 8.7-8.7z"/></svg>`
  },
  jenkins: {
    name: 'Jenkins',
    color: '#3B82F6',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`
  },
  docker: {
    name: 'Docker / 容器',
    color: '#06B6D4',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186m5.893 2.714h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186H5.136a.186.186 0 00-.186.185v1.888c0 .102.084.185.186.185m-2.928 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186H2.208a.186.186 0 00-.186.185v1.888c0 .102.083.185.186.185M23.987 11.5c-.385-.63-.984-1.048-1.688-1.182-.243-.046-.49-.06-.734-.042-.32.023-.635.09-.933.2-.218-.747-.69-1.396-1.334-1.832a4.423 4.423 0 00-2.527-.768h-1.08a.186.186 0 00-.186.186v4.61H1.056c-.52 0-.96.4-1.042.915-.098.618-.014 2.457 1.058 4.225 1.134 1.869 3.197 3.328 6.55 3.328 5.69 0 9.877-2.915 12.022-7.852.793.08 1.58-.163 2.164-.67.653-.57.994-1.39.994-2.28 0-.276-.026-.549-.077-.818"/></svg>`
  },
  kubernetes: {
    name: 'Kubernetes',
    color: '#326CE5',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.001 0l-9.52 5.5v11l9.52 5.5 9.52-5.5v-11zm-1.08 3.52c.32-.04.64.08.85.33l1.83 2.11 2.76-.55c.32-.07.65.04.87.29.21.24.27.58.15.88l-1.06 2.63 2.16 1.77c.25.2.37.52.32.84-.06.31-.26.58-.56.68l-2.73.9.27 2.82c.03.32-.12.63-.39.79-.26.17-.6.18-.87.03l-2.48-1.37-2.48 1.37c-.27.15-.61.14-.87-.03-.27-.16-.42-.47-.39-.79l.27-2.82-2.73-.9c-.3-.1-.5-.37-.56-.68-.05-.32.07-.64.32-.84l2.16-1.77-1.06-2.63c-.12-.3-.06-.64.15-.88.22-.25.55-.36.87-.29l2.76.55 1.83-2.11c.14-.17.34-.27.55-.29z"/></svg>`
  },
  prometheus: {
    name: 'Prometheus',
    color: '#E6522C',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.372 0 0 5.372 0 12c0 4.984 3.037 9.258 7.371 11.063-.07-.941-.013-2.074.24-2.968l1.455-5.918s-.363-.728-.363-1.804c0-1.691.98-2.953 2.203-2.953 1.039 0 1.54.78 1.54 1.716 0 1.045-.666 2.608-1.01 4.057-.287 1.213.608 2.203 1.804 2.203 2.165 0 3.83-2.283 3.83-5.578 0-2.915-2.096-4.953-5.087-4.953-3.465 0-5.498 2.599-5.498 5.28 0 1.046.402 2.168.905 2.778a.36.36 0 01.083.344l-.338 1.38c-.054.22-.178.267-.412.162-1.54-.716-2.502-2.964-2.502-4.772 0-3.886 2.824-7.455 8.143-7.455 4.275 0 7.598 3.047 7.598 7.118 0 4.248-2.678 7.668-6.395 7.668-1.248 0-2.422-.649-2.825-1.417l-.768 2.928c-.278 1.07-1.03 2.41-1.534 3.23A12.016 12.016 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>`
  },
  chatgpt: {
    name: 'ChatGPT / OpenAI',
    color: '#10A37F',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.985 5.985 0 00-3.998 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.771-4.205 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.746-7.074zm-9.022 12.608a4.474 4.474 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.604 15.33a4.456 4.456 0 01-.546-3.003l.145.087 4.774 2.757a.795.795 0 00.787 0l5.84-3.369v2.332a.08.08 0 01-.033.062L9.74 16.95a4.5 4.5 0 01-6.136-1.62zM2.37 7.79a4.474 4.474 0 012.33-1.964v5.6a.79.79 0 00.392.684l5.84 3.37-2.02 1.166a.08.08 0 01-.073 0l-4.832-2.79A4.504 4.504 0 012.37 7.79zm15.426 3.19l-5.84-3.37 2.02-1.166a.08.08 0 01.073 0l4.832 2.79a4.504 4.504 0 01-.679 8.11v-5.679a.79.79 0 00-.406-.685zm2.6-2.134l-.145-.087-4.774-2.757a.795.795 0 00-.787 0L8.85 9.38V7.049a.08.08 0 01.033-.062l4.832-2.787a4.5 4.5 0 016.68 4.654zM10.74 1.57a4.474 4.474 0 012.876 1.04l-.141.081-4.779 2.758a.795.795 0 00-.392.681v6.737L6.284 11.7a.071.071 0 01-.038-.052V6.065a4.504 4.504 0 014.494-4.494zm-1.84 7.248l3.1 1.79 3.1-1.79v3.58l-3.1 1.79-3.1-1.79V8.818z"/></svg>`
  },
  claude: {
    name: 'Claude AI',
    color: '#D97706',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2V7h2v10z"/></svg>`
  },
  confluence: {
    name: 'Confluence / Wiki',
    color: '#0052CC',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.01 2.2c-.37 0-.74.15-1.02.43L2.63 11c-.59.59-.59 1.54 0 2.12l8.36 8.36c.28.28.65.43 1.02.43s.74-.15 1.02-.43l8.36-8.36c.59-.59.59-1.54 0-2.12L13.03 2.63c-.28-.28-.65-.43-1.02-.43z"/></svg>`
  },
  redis: {
    name: 'Redis',
    color: '#DC382D',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.043 14.885c0-1.802-.916-3.4-2.34-4.385l-7.05-4.838a1.27 1.27 0 00-1.455 0L4.148 10.5A5.36 5.36 0 001.808 14.885c0 2.98 2.455 5.394 5.485 5.394h9.264c3.03 0 5.486-2.414 5.486-5.394zM12 8.423l4.896 3.36-4.896 3.36-4.896-3.36L12 8.423z"/></svg>`
  },
  mysql: {
    name: 'MySQL',
    color: '#4479A1',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.564 7.625c-.244-.457-.611-.83-.996-1.121-.295-.224-.658-.387-1.024-.482-.676-.176-1.423-.1-2.03.228-.617.333-1.077.892-1.374 1.528-.415.89-.482 1.916-.27 2.87.16.723.518 1.393.993 1.93.428.483.978.85 1.58 1.05.615.205 1.296.21 1.914.015.616-.194 1.173-.574 1.597-1.07.41-.482.686-1.075.8-1.706.115-.632.05-1.29-.19-1.89-.19-.475-.5-.9-.8-1.252zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>`
  },
  vue: {
    name: 'Vue.js',
    color: '#42B883',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 1.61H14.01L12 5.1 9.99 1.61H0l12 20.78L24 1.61zm-4.14 0h-4.63L12 7.23 8.77 1.61H4.14L12 15.22l7.86-13.61z"/></svg>`
  },
  react: {
    name: 'React',
    color: '#61DAFB',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0-7c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 2C7.58 4 4 7.58 4 12s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8z"/></svg>`
  },
  server: {
    name: 'Server / 微服务',
    color: '#06B6D4',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`
  },
  database: {
    name: 'Database / 数据库',
    color: '#10B981',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`
  },
  globe: {
    name: 'Globe / 网页通用',
    color: '#3B82F6',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
  },
  terminal: {
    name: 'Terminal / 终端',
    color: '#10B981',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`
  },
  cloud: {
    name: 'Cloud / 云平台',
    color: '#38BDF8',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`
  },
  shield: {
    name: 'Security / 安全认证',
    color: '#EC4899',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
  }
};

// 内存单例缓存池，保证页面渲染0延迟
const memoryIconCache = new Map();
const ongoingFetches = new Set();

/**
 * 预热加载所有远程图标缓存进内存
 */
export async function preloadRemoteIconCaches() {
  try {
    const { getAllRemoteIconCaches } = await import('./storage.js');
    const allCaches = await getAllRemoteIconCaches();
    for (const [k, v] of Object.entries(allCaches)) {
      if (v && v.data) {
        memoryIconCache.set(k, v.data);
      }
    }
  } catch (e) {
    console.warn('Preload icon cache failed:', e);
  }
}

/**
 * 远程下载 SVG/图片并存入缓存 (自愈管道)
 */
export async function downloadAndCacheRemoteIcon(iconKey) {
  if (!iconKey || !iconKey.startsWith('remote:') || ongoingFetches.has(iconKey)) {
    return null;
  }
  ongoingFetches.add(iconKey);

  try {
    let targetUrl = '';
    if (iconKey.startsWith('remote:iconify:')) {
      const iconName = iconKey.replace('remote:iconify:', '');
      targetUrl = `https://api.iconify.design/${iconName.replace(':', '/')}.svg`;
    } else if (iconKey.startsWith('remote:url:')) {
      targetUrl = iconKey.replace('remote:url:', '');
    }

    if (!targetUrl) return null;

    const res = await fetch(targetUrl, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let dataUrl = '';
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('svg') || targetUrl.endsWith('.svg')) {
      const svgText = await res.text();
      dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`;
    } else {
      const blob = await res.blob();
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    }

    if (dataUrl) {
      memoryIconCache.set(iconKey, dataUrl);
      await setRemoteIconCache(iconKey, dataUrl, targetUrl);

      // 通知当前页面中使用了该自愈占位符的 DOM 进行无缝实时热替换
      if (typeof document !== 'undefined') {
        const placeholders = document.querySelectorAll(`[data-self-heal-icon="${iconKey}"]`);
        placeholders.forEach(el => {
          const className = el.getAttribute('data-icon-class') || 'w-4 h-4';
          const img = document.createElement('img');
          img.src = dataUrl;
          img.className = `${className} object-contain rounded transition-opacity duration-300`;
          img.alt = 'icon';
          el.replaceWith(img);
        });
      }

      return dataUrl;
    }
  } catch (err) {
    console.warn(`[RemoteIcon] Self-heal fetch failed for ${iconKey}:`, err);
  } finally {
    ongoingFetches.delete(iconKey);
  }
  return null;
}

/**
 * 根据图标标识获取渲染后的 SVG 或 Favicon 图像 HTML
 */
export function renderIcon(iconKey, customIconData = null, className = 'w-4 h-4') {
  // 1. 如果书签自身附带了 Base64 图标数据，优先使用
  if (customIconData) {
    return `<img src="${customIconData}" class="${className} object-contain rounded" alt="icon" onerror="this.onerror=null;this.style.display='none'">`;
  }

  // 2. 如果是远程图标标识 (remote:iconify:* 或 remote:url:*)
  if (iconKey && iconKey.startsWith('remote:')) {
    const cachedData = memoryIconCache.get(iconKey);
    if (cachedData) {
      return `<img src="${cachedData}" class="${className} object-contain rounded" alt="icon" onerror="this.onerror=null;this.style.display='none'">`;
    }

    // 未命中内存缓存（可能初次加载或缓存被清除），返回占位符并触发异步自愈下载
    setTimeout(() => downloadAndCacheRemoteIcon(iconKey), 10);
    return `<span data-self-heal-icon="${iconKey}" data-icon-class="${className}" class="${className} flex items-center justify-center">${getFallbackSvg(className)}</span>`;
  }

  // 3. 如果是内置精选品牌图标
  if (iconKey && BRAND_ICONS[iconKey]) {
    const iconObj = BRAND_ICONS[iconKey];
    return `<div class="${className} flex items-center justify-center">${iconObj.svg}</div>`;
  }

  // 4. 兜底使用通用地球/书签图标
  return getFallbackSvg(className);
}

function getFallbackSvg(className = 'w-4 h-4') {
  return `<svg class="${className} text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>`;
}

/**
 * 搜索本地内置精选图标
 */
export function searchIcons(query = '') {
  if (!query || query.trim() === '') {
    return Object.entries(BRAND_ICONS).map(([key, data]) => ({ key, ...data }));
  }
  const q = query.toLowerCase();
  return Object.entries(BRAND_ICONS)
    .filter(([key, data]) => key.includes(q) || data.name.toLowerCase().includes(q))
    .map(([key, data]) => ({ key, ...data }));
}

/**
 * 在线搜索 Iconify 图标库 (200,000+ 免费图标)
 */
export async function searchRemoteIconify(query, limit = 36) {
  if (!query || !query.trim()) return [];
  try {
    const url = `https://api.iconify.design/search?query=${encodeURIComponent(query.trim())}&limit=${limit}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.icons)) return [];

    return data.icons.map(iconFullName => {
      // iconFullName 格式如: 'simple-icons:gitlab', 'logos:vue', 'mdi:account'
      const parts = iconFullName.split(':');
      const prefix = parts[0] || 'icon';
      const name = parts[1] || iconFullName;
      return {
        key: `remote:iconify:${iconFullName}`,
        fullName: iconFullName,
        name: name,
        prefix: prefix,
        previewUrl: `https://api.iconify.design/${prefix}/${name}.svg`
      };
    });
  } catch (e) {
    console.warn('[RemoteIcon] Iconify search failed:', e);
    return [];
  }
}
