import { THEMES, PRESET_WALLPAPERS, DEFAULT_SETTINGS } from './constants.js';
import { getSettings, saveSettings, getCustomThemes, saveCustomTheme, getAllThemes, getWallpaperSettings, saveWallpaperSettings } from './storage.js';
import { createZip, extractZip } from './zip-helper.js';

// 5 套内置主题的预设完整 CSS 变量表（供导出和渲染使用）
export const PRESET_THEME_VARIABLES = {
  'dark-slate': {
    '--bg-main': '#0f172a',
    '--bg-card': '#1e293b',
    '--bg-card-hover': '#334155',
    '--bg-subtle': '#0b1120',
    '--bg-input': '#1e293b',
    '--border': '#334155',
    '--border-focus': '#6366f1',
    '--text-main': '#f8fafc',
    '--text-muted': '#94a3b8',
    '--text-dim': '#64748b',
    '--color-clock': '#f8fafc',
    '--color-date': '#94a3b8',
    '--color-motto': '#94a3b8',
    '--color-motto-star': '#6366f1',
    '--primary': '#6366f1',
    '--primary-hover': '#4f46e5',
    '--primary-fg': '#ffffff',
    '--accent-intranet': '#10b981',
    '--accent-extranet': '#3b82f6',
    '--accent-warn': '#f59e0b',
    '--accent-danger': '#ef4444'
  },
  'clean-light': {
    '--bg-main': '#f8fafc',
    '--bg-card': '#ffffff',
    '--bg-card-hover': '#f1f5f9',
    '--bg-subtle': '#edf2f7',
    '--bg-input': '#f8fafc',
    '--border': '#e2e8f0',
    '--border-focus': '#4f46e5',
    '--text-main': '#0f172a',
    '--text-muted': '#64748b',
    '--text-dim': '#94a3b8',
    '--color-clock': '#0f172a',
    '--color-date': '#64748b',
    '--color-motto': '#64748b',
    '--color-motto-star': '#4f46e5',
    '--primary': '#4f46e5',
    '--primary-hover': '#4338ca',
    '--primary-fg': '#ffffff',
    '--accent-intranet': '#059669',
    '--accent-extranet': '#2563eb',
    '--accent-warn': '#d97706',
    '--accent-danger': '#dc2626'
  },
  'cyber-indigo': {
    '--bg-main': '#09090b',
    '--bg-card': '#18181b',
    '--bg-card-hover': '#27272a',
    '--bg-subtle': '#000000',
    '--bg-input': '#18181b',
    '--border': '#27272a',
    '--border-focus': '#ec4899',
    '--text-main': '#fafafa',
    '--text-muted': '#a1a1aa',
    '--text-dim': '#71717a',
    '--color-clock': '#fafafa',
    '--color-date': '#a1a1aa',
    '--color-motto': '#a1a1aa',
    '--color-motto-star': '#ec4899',
    '--primary': '#ec4899',
    '--primary-hover': '#db2777',
    '--primary-fg': '#ffffff',
    '--accent-intranet': '#06b6d4',
    '--accent-extranet': '#8b5cf6',
    '--accent-warn': '#eab308',
    '--accent-danger': '#f43f5e'
  },
  'emerald-minimal': {
    '--bg-main': '#064e3b',
    '--bg-card': '#065f46',
    '--bg-card-hover': '#047857',
    '--bg-subtle': '#022c22',
    '--bg-input': '#065f46',
    '--border': '#047857',
    '--border-focus': '#34d399',
    '--text-main': '#ecfdf5',
    '--text-muted': '#a7f3d0',
    '--text-dim': '#6ee7b7',
    '--color-clock': '#ecfdf5',
    '--color-date': '#a7f3d0',
    '--color-motto': '#a7f3d0',
    '--color-motto-star': '#10b981',
    '--primary': '#10b981',
    '--primary-hover': '#059669',
    '--primary-fg': '#ffffff',
    '--accent-intranet': '#34d399',
    '--accent-extranet': '#38bdf8',
    '--accent-warn': '#fbbf24',
    '--accent-danger': '#f87171'
  },
  'sunset-warm': {
    '--bg-main': '#1c1917',
    '--bg-card': '#292524',
    '--bg-card-hover': '#44403c',
    '--bg-subtle': '#0c0a09',
    '--bg-input': '#292524',
    '--border': '#44403c',
    '--border-focus': '#f97316',
    '--text-main': '#fafaf9',
    '--text-muted': '#a8a29e',
    '--text-dim': '#78716c',
    '--color-clock': '#fafaf9',
    '--color-date': '#a8a29e',
    '--color-motto': '#a8a29e',
    '--color-motto-star': '#f97316',
    '--primary': '#f97316',
    '--primary-hover': '#ea580c',
    '--primary-fg': '#ffffff',
    '--accent-intranet': '#84cc16',
    '--accent-extranet': '#0ea5e9',
    '--accent-warn': '#eab308',
    '--accent-danger': '#ef4444'
  }
};

/**
 * 获取官方 Bing 每日一图高清壁纸信息
 */
export async function fetchBingDailyWallpaper() {
  try {
    const apiUrls = [
      'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN',
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN'
    ];
    let res = null;
    for (const url of apiUrls) {
      try {
        res = await fetch(url, { cache: 'no-cache' });
        if (res && res.ok) break;
      } catch (err) {
        // try next url
      }
    }
    if (!res || !res.ok) {
      throw new Error('Bing API 网络请求失败');
    }
    const data = await res.json();
    if (!data.images || data.images.length === 0) {
      throw new Error('未获取到 Bing 壁纸数据');
    }
    const imgObj = data.images[0];
    let fullUrl = '';
    if (imgObj.urlbase) {
      fullUrl = `https://cn.bing.com${imgObj.urlbase}_1920x1080.jpg`;
    } else if (imgObj.url) {
      fullUrl = imgObj.url.startsWith('http') ? imgObj.url : `https://cn.bing.com${imgObj.url}`;
    }

    return {
      url: fullUrl,
      thumb: fullUrl,
      date: imgObj.startdate || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      title: imgObj.title || '必应每日壁纸',
      copyright: imgObj.copyright || '',
      copyrightlink: imgObj.copyrightlink || 'https://cn.bing.com'
    };
  } catch (err) {
    console.warn('[Theme] 拉取 Bing 壁纸异常:', err);
    return null;
  }
}

/**
 * 检查并静默同步今日最新 Bing 每日壁纸 (跨天自动更新)
 */
export async function syncBingDailyWallpaper(force = false) {
  try {
    const wp = await getWallpaperSettings();
    if (!wp || !wp.enabled || wp.mode !== 'bing') {
      return wp;
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    if (!force && wp.bingDate === todayStr && wp.bingUrl) {
      return wp;
    }

    const bingInfo = await fetchBingDailyWallpaper();
    if (bingInfo && bingInfo.url) {
      const updatedWp = await saveWallpaperSettings({
        enabled: true,
        mode: 'bing',
        bingUrl: bingInfo.url,
        bingDate: bingInfo.date || todayStr,
        bingTitle: bingInfo.title,
        bingCopyright: bingInfo.copyright,
        bingCopyrightLink: bingInfo.copyrightlink
      });
      await applyWallpaper(updatedWp);
      return updatedWp;
    }
    return wp;
  } catch (err) {
    console.error('[Theme] 自动同步 Bing 壁纸失败:', err);
    return null;
  }
}

/**
 * 页面启动时初始化主题与壁纸
 */
export async function initTheme() {
  const settings = await getSettings();
  const themeId = settings.theme || 'dark-slate';
  await applyTheme(themeId);
  await applyWallpaper(settings.wallpaper);

  // 若处于必应每日壁纸模式，异步自检跨天更新
  if (settings.wallpaper && settings.wallpaper.enabled && settings.wallpaper.mode === 'bing') {
    syncBingDailyWallpaper().catch(() => {});
  }

  return themeId;
}

/**
 * 应用全局壁纸渲染 (支持单壁纸、多壁纸主题包首张默认壁纸与必应每日壁纸)
 */
export async function applyWallpaper(wallpaperConfig = null) {
  let wp = wallpaperConfig;
  if (wp === null) {
    wp = await getWallpaperSettings();
  }

  const layer = document.getElementById('app-wallpaper-layer');
  const mask = document.getElementById('app-wallpaper-mask');
  if (!layer || !mask) return;

  if (!wp || !wp.enabled) {
    layer.classList.add('hidden');
    layer.style.backgroundImage = 'none';
    mask.classList.add('hidden');
    document.body.classList.remove('has-wallpaper');
    return;
  }

  let imgUrl = '';
  // 优先提取多壁纸包中的首选默认壁纸
  if (wp.wallpapers && Array.isArray(wp.wallpapers) && wp.wallpapers.length > 0) {
    const defaultWp = wp.wallpapers[wp.defaultIndex || 0] || wp.wallpapers[0];
    if (defaultWp.dataUrl) {
      imgUrl = defaultWp.dataUrl;
    } else if (defaultWp.url) {
      imgUrl = defaultWp.url;
    } else if (defaultWp.presetId) {
      const p = PRESET_WALLPAPERS.find(x => x.id === defaultWp.presetId) || PRESET_WALLPAPERS[0];
      imgUrl = p.url;
    }
  }

  if (!imgUrl) {
    if (wp.mode === 'bing') {
      imgUrl = wp.bingUrl || 'https://cn.bing.com/th?id=OHR.MountFuji_ZH-CN_1920x1080.jpg';
    } else if (wp.mode === 'custom' && wp.customDataUrl) {
      imgUrl = wp.customDataUrl;
    } else if (wp.mode === 'url' && wp.customUrl) {
      imgUrl = wp.customUrl;
    } else {
      const preset = PRESET_WALLPAPERS.find(p => p.id === wp.presetId) || PRESET_WALLPAPERS[0];
      imgUrl = preset.url;
    }
  }

  if (!imgUrl) {
    imgUrl = PRESET_WALLPAPERS[0].url;
  }

  const blurVal = wp.blur || 0;
  const maskVal = wp.mask !== undefined ? wp.mask : 0.35;

  layer.classList.remove('hidden');
  layer.style.backgroundImage = `url("${imgUrl}")`;
  layer.style.filter = `blur(${blurVal}px)`;
  layer.style.transform = blurVal > 0 ? 'scale(1.04)' : 'scale(1)';

  mask.classList.remove('hidden');
  mask.style.opacity = maskVal;

  document.body.classList.add('has-wallpaper');
}

/**
 * 应用指定主题包（支持内置与动态 DIY 主题包，可选同步应用绑定的壁纸）
 */
export async function applyTheme(themeId, directThemeObj = null, syncWallpaper = false) {
  let theme = directThemeObj;
  
  if (!theme) {
    const all = await getAllThemes();
    theme = all.find(t => t.id === themeId);
  }

  // 找不到则回退默认
  if (!theme) {
    themeId = 'dark-slate';
    theme = THEMES.find(t => t.id === themeId);
  }

  const isBuiltIn = THEMES.some(t => t.id === themeId);

  // 动态注入自定义主题 CSS 变量规则
  let dynamicStyleEl = document.getElementById('dynamic-custom-theme-style');
  if (!isBuiltIn && theme && theme.variables) {
    if (!dynamicStyleEl) {
      dynamicStyleEl = document.createElement('style');
      dynamicStyleEl.id = 'dynamic-custom-theme-style';
      document.head.appendChild(dynamicStyleEl);
    }

    const cssRules = Object.entries(theme.variables)
      .map(([k, v]) => `  ${k}: ${v} !important;`)
      .join('\n');

    dynamicStyleEl.textContent = `
[data-theme="${themeId}"] {
${cssRules}
}
`;
  } else if (isBuiltIn && dynamicStyleEl) {
    dynamicStyleEl.textContent = '';
  }

  document.documentElement.setAttribute('data-theme', themeId);
  document.body.setAttribute('data-theme', themeId);

  // 若需要同步套用主题包内置的专属壁纸
  if (syncWallpaper && theme && theme.wallpaper && theme.wallpaper.enabled) {
    await applyWallpaper(theme.wallpaper);
    await saveWallpaperSettings(theme.wallpaper);
  }

  // 更新浏览器顶栏颜色适配
  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement('meta');
    metaTheme.name = 'theme-color';
    document.head.appendChild(metaTheme);
  }
  metaTheme.content = (theme && theme.previewBg) ? theme.previewBg : (themeId === 'clean-light' ? '#f8fafc' : '#0f172a');
}

/**
 * 设置并持久化当前主题包
 */
export async function setTheme(themeId, syncWallpaper = false) {
  await applyTheme(themeId, null, syncWallpaper);
  await saveSettings({ theme: themeId });
}

/**
 * 辅助：将 DataURL 转为 Uint8Array
 */
function dataUrlToBytes(dataUrl) {
  const arr = dataUrl.split(',');
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return u8arr;
}

/**
 * 辅助：将 Uint8Array 转为 DataURL
 */
function bytesToDataUrl(bytes, mimeType = 'image/png') {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * 导出指定主题包为标准 .zip 压缩包（支持多壁纸完整打包导出）
 */
export async function exportThemeAsZip(themeId) {
  const allThemes = await getAllThemes();
  const theme = allThemes.find(t => t.id === themeId) || THEMES[0];

  const variables = (theme.variables) 
    ? { ...theme.variables }
    : (PRESET_THEME_VARIABLES[theme.id] || PRESET_THEME_VARIABLES['dark-slate']);

  const filesToZip = [];
  let bundledWallpapersMeta = [];

  // 若该主题包含壁纸（支持单壁纸与多壁纸）
  if (theme.wallpaper && theme.wallpaper.enabled) {
    try {
      const rawList = theme.wallpaper.wallpapers && theme.wallpaper.wallpapers.length > 0
        ? theme.wallpaper.wallpapers
        : (theme.wallpaper.customDataUrl ? [{ name: '默认壁纸', dataUrl: theme.wallpaper.customDataUrl }] : (theme.wallpaper.presetId ? [{ name: '精选壁纸', presetId: theme.wallpaper.presetId }] : []));

      for (let i = 0; i < rawList.length; i++) {
        const wp = rawList[i];
        const fileExt = wp.dataUrl && wp.dataUrl.startsWith('data:image/webp') ? 'webp' : 'jpg';
        const fileName = `wallpaper_${i + 1}.${fileExt}`;

        if (wp.dataUrl) {
          const imgBytes = dataUrlToBytes(wp.dataUrl);
          filesToZip.push({ name: fileName, data: imgBytes });
          bundledWallpapersMeta.push({ id: wp.id || `wp_${i + 1}`, name: wp.name || `壁纸 ${i + 1}`, fileName, isDefault: i === 0 });
        } else if (wp.presetId) {
          const preset = PRESET_WALLPAPERS.find(p => p.id === wp.presetId) || PRESET_WALLPAPERS[0];
          try {
            const res = await fetch(preset.thumb || preset.url);
            const buf = await res.arrayBuffer();
            filesToZip.push({ name: fileName, data: new Uint8Array(buf) });
            bundledWallpapersMeta.push({ id: wp.id || `wp_${i + 1}`, name: preset.name || `壁纸 ${i + 1}`, fileName, isDefault: i === 0 });
          } catch (e) {
            bundledWallpapersMeta.push({ id: wp.id || `wp_${i + 1}`, name: preset.name || `壁纸 ${i + 1}`, presetId: wp.presetId, isDefault: i === 0 });
          }
        }
      }
    } catch (err) {
      console.warn('Export wallpaper into zip failed:', err);
    }
  }

  const themeManifest = {
    smartBookmarkTheme: true,
    format: 'zip_package',
    version: '3.1',
    exportTime: new Date().toISOString(),
    id: theme.id.startsWith('theme_diy_') ? theme.id : `theme_custom_${theme.id}`,
    name: theme.name || '自定义主题包',
    author: theme.author || 'Smart Bookmark 用户',
    isDark: theme.isDark !== false,
    previewBg: theme.previewBg || variables['--bg-main'] || '#0f172a',
    previewBorder: theme.previewBorder || variables['--primary'] || '#6366f1',
    variables,
    wallpaper: theme.wallpaper && theme.wallpaper.enabled ? {
      enabled: true,
      mode: 'bundled',
      defaultIndex: 0,
      wallpapers: bundledWallpapersMeta,
      blur: theme.wallpaper.blur || 0,
      mask: theme.wallpaper.mask !== undefined ? theme.wallpaper.mask : 0.35
    } : null
  };

  filesToZip.push({
    name: 'theme.json',
    data: JSON.stringify(themeManifest, null, 2)
  });

  const zipBlob = await createZip(filesToZip);
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (theme.name || 'custom_theme_pack').replace(/[\\/:*?"<>| ]/g, '_');
  a.download = `smart_theme_${safeName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return themeManifest;
}

/**
 * 兼容旧版的单 JSON 导出
 */
export async function exportThemeAsJson(themeId) {
  return exportThemeAsZip(themeId);
}

/**
 * 从 ZIP 压缩包（或旧版 JSON）导入自定义主题包（完整解压多张壁纸，第一张作为默认壁纸）
 */
export async function importThemeFromPackage(fileOrContent) {
  // 1. 如果传入的是 File 且为 ZIP 压缩包
  if (fileOrContent instanceof File || (fileOrContent && fileOrContent.name && fileOrContent.name.endsWith('.zip'))) {
    const filesMap = await extractZip(fileOrContent);
    const themeJsonBytes = filesMap.get('theme.json');
    if (!themeJsonBytes) {
      throw new Error('ZIP 压缩包内未找到 theme.json 描述文件');
    }

    const decoder = new TextDecoder('utf-8');
    const manifest = JSON.parse(decoder.decode(themeJsonBytes));

    // 查找并排序压缩包内所有壁纸图片文件
    const imageFileNames = Array.from(filesMap.keys())
      .filter(fileName => fileName.startsWith('wallpaper') || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp'))
      .sort((a, b) => a.localeCompare(b));

    const extractedWallpapers = [];
    for (let i = 0; i < imageFileNames.length; i++) {
      const fileName = imageFileNames[i];
      const imgBytes = filesMap.get(fileName);
      let mime = 'image/png';
      if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mime = 'image/jpeg';
      else if (fileName.endsWith('.webp')) mime = 'image/webp';
      const dataUrl = bytesToDataUrl(imgBytes, mime);

      extractedWallpapers.push({
        id: `imported_wp_${Date.now()}_${i + 1}`,
        name: `壁纸 ${i + 1}`,
        dataUrl,
        isDefault: i === 0
      });
    }

    let wallpaperConfig = null;
    if (extractedWallpapers.length > 0 || (manifest.wallpaper && manifest.wallpaper.enabled)) {
      wallpaperConfig = {
        enabled: true,
        mode: extractedWallpapers.length > 0 ? 'bundled' : (manifest.wallpaper.mode || 'preset'),
        defaultIndex: 0,
        wallpapers: extractedWallpapers,
        customDataUrl: extractedWallpapers.length > 0 ? extractedWallpapers[0].dataUrl : (manifest.wallpaper ? manifest.wallpaper.customDataUrl : ''),
        presetId: manifest.wallpaper ? manifest.wallpaper.presetId || 'dark_geometry' : 'dark_geometry',
        blur: manifest.wallpaper ? (manifest.wallpaper.blur || 0) : 0,
        mask: manifest.wallpaper && manifest.wallpaper.mask !== undefined ? manifest.wallpaper.mask : 0.35
      };
    }

    const themeObj = {
      id: manifest.id ? (manifest.id.startsWith('theme_') ? manifest.id : 'theme_' + manifest.id) : ('theme_diy_' + Date.now()),
      name: manifest.name ? manifest.name.trim() : '导入主题包',
      author: (manifest.author || '社区用户').trim(),
      isDark: manifest.isDark !== false,
      previewBg: manifest.previewBg || manifest.variables['--bg-main'] || '#0f172a',
      previewBorder: manifest.previewBorder || manifest.variables['--primary'] || '#6366f1',
      variables: manifest.variables || PRESET_THEME_VARIABLES['dark-slate'],
      wallpaper: wallpaperConfig,
      isCustom: true
    };

    await saveCustomTheme(themeObj);
    await setTheme(themeObj.id, Boolean(themeObj.wallpaper && themeObj.wallpaper.enabled));
    return themeObj;
  }

  // 2. 兼容旧版 JSON 文本或对象导入
  return importThemeFromJson(fileOrContent);
}

/**
 * 从 JSON 对象或文本导入自定义主题包（包含色彩与关联壁纸）
 */
export async function importThemeFromJson(jsonInput) {
  let pkg = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;

  if (!pkg || typeof pkg !== 'object') {
    throw new Error('无效的主题包格式');
  }

  if (!pkg.name) {
    throw new Error('主题包缺少 name 字段');
  }

  let variables = pkg.variables || {};
  if (Object.keys(variables).length === 0) {
    const bgMain = pkg.bgMain || pkg.previewBg || '#0f172a';
    const bgCard = pkg.bgCard || '#1e293b';
    const primary = pkg.primary || pkg.previewBorder || '#6366f1';
    const textMain = pkg.textMain || '#f8fafc';
    const textMuted = pkg.textMuted || '#94a3b8';
    const border = pkg.border || '#334155';

    variables = {
      '--bg-main': bgMain,
      '--bg-card': bgCard,
      '--bg-card-hover': pkg.bgCardHover || '#334155',
      '--bg-subtle': pkg.bgSubtle || '#0b1120',
      '--bg-input': bgCard,
      '--border': border,
      '--border-focus': primary,
      '--text-main': textMain,
      '--text-muted': textMuted,
      '--text-dim': pkg.textDim || '#64748b',
      '--color-clock': pkg.colorClock || variables['--color-clock'] || textMain,
      '--color-date': pkg.colorDate || variables['--color-date'] || textMuted,
      '--color-motto': pkg.colorMotto || variables['--color-motto'] || textMuted,
      '--color-motto-star': pkg.colorMottoStar || variables['--color-motto-star'] || primary,
      '--primary': primary,
      '--primary-hover': primary,
      '--primary-fg': '#ffffff',
      '--accent-intranet': '#10b981',
      '--accent-extranet': '#3b82f6',
      '--accent-warn': '#f59e0b',
      '--accent-danger': '#ef4444'
    };
  }

  const themeObj = {
    id: pkg.id ? (pkg.id.startsWith('theme_') ? pkg.id : 'theme_' + pkg.id) : ('theme_diy_' + Date.now()),
    name: pkg.name.trim(),
    author: (pkg.author || '社区用户').trim(),
    isDark: pkg.isDark !== false,
    previewBg: pkg.previewBg || variables['--bg-main'] || '#0f172a',
    previewBorder: pkg.previewBorder || variables['--primary'] || '#6366f1',
    variables,
    wallpaper: pkg.wallpaper || null,
    isCustom: true
  };

  await saveCustomTheme(themeObj);
  await setTheme(themeObj.id, Boolean(themeObj.wallpaper && themeObj.wallpaper.enabled));

  return themeObj;
}

