/**
 * Smart Bookmark 响应式 i18n 引擎 (Svelte 5 Runes 驱动)
 * 纯轻量设计，无外部重型依赖，支持模板参数替换与深层键解析
 */
import zhCN from './locales/zh-CN.js';
import enUS from './locales/en-US.js';

const LOCALES = {
  'zh-CN': zhCN,
  'en-US': enUS
};

export const SUPPORTED_LANGUAGES = [
  { value: 'auto', labelKey: 'settings.languageAuto', iconText: '🌐' },
  { value: 'zh-CN', labelKey: 'settings.languageZh', iconText: '🇨🇳' },
  { value: 'en-US', labelKey: 'settings.languageEn', iconText: '🇺🇸' }
];

class I18nEngine {
  // 用户设定的偏好：'auto' | 'zh-CN' | 'en-US'
  configuredLocale = $state('auto');

  // 响应式派生当前生效的语言代码：'zh-CN' | 'en-US'
  currentLocale = $derived.by(() => {
    if (this.configuredLocale && this.configuredLocale !== 'auto') {
      return this.configuredLocale;
    }
    // 跟随浏览器系统语言
    if (typeof navigator !== 'undefined' && navigator.language) {
      const lang = navigator.language.toLowerCase();
      if (lang.startsWith('zh')) {
        return 'zh-CN';
      }
    }
    return 'en-US';
  });

  init(locale = 'auto') {
    this.configuredLocale = locale || 'auto';
  }

  setLocale(locale) {
    this.configuredLocale = locale || 'auto';
  }

  /**
   * 深层属性提取
   */
  getNested(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in cur) {
        cur = cur[part];
      } else {
        return undefined;
      }
    }
    return cur;
  }

  /**
   * 翻译函数，支持点分嵌套解析与占位符变量插值
   * @param {string} key 键名，例如 'common.confirm'
   * @param {Record<string, any>} [params] 插值对象，例如 { count: 10 }
   * @param {string} [fallback] 缺失时的兜底字符串
   */
  t(key, params = {}, fallback = '') {
    const activeDict = LOCALES[this.currentLocale] || LOCALES['zh-CN'];
    let value = this.getNested(activeDict, key);

    // 如果英文词条缺失，自动安全回退至中文基准字典
    if (value === undefined && this.currentLocale !== 'zh-CN') {
      value = this.getNested(LOCALES['zh-CN'], key);
    }

    if (value === undefined) {
      return fallback || key;
    }

    // 插值替换: "共计 {count} 项" -> "共计 5 项"
    if (typeof value === 'string' && params && typeof params === 'object') {
      return value.replace(/\{(\w+)\}/g, (_, varName) => {
        return params[varName] !== undefined ? String(params[varName]) : `{${varName}}`;
      });
    }

    return value;
  }
}

export const i18n = new I18nEngine();

// 便捷导出响应式翻译函数
export const t = (key, params, fallback) => i18n.t(key, params, fallback);
