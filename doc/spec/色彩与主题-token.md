# 色彩系统与 3 套极简主题 (Color Tokens)

> 本文档为《前端设计规范》第 2 章拆分，详见 [前端设计规范.md](../前端设计规范.md)

抛弃过度花哨的霓虹赛博色系，精选 3 套极具质感、高对比度且适合长时间注视的纯粹调色盘。

## 2.1 极简主题定义

### 1. 📜 **Paper Sand (纸本暖沙 · 默认首选)**
*灵感源自再生纸与电子墨水屏，质朴、安宁、温和护眼。*
- **Canvas (背景)**: `#F5F2EB` (温润纸本底色)
- **Surface (卡片/弹窗)**: `#FAF8F5` (纯净纸面)
- **Subtle (输入框/次级背景)**: `#EAE5DB` (柔和凹陷底色)
- **Border (边框分割)**: `#DDD7CD` (柔和纸边框)
- **Text Primary (主文字)**: `#2D2B28` (胡桃木深灰褐)
- **Text Secondary (次要文字)**: `#756F68` (中性纸墨灰)
- **Text Tertiary (微弱文字)**: `#A8A196` (浅色字)
- **Accent (强调色)**: `#3A5A40` (沉稳墨绿)

### 2. ⚪ **Ceramic Light (陶瓷素白 · 柔和浅色)**
*灵感源自现代骨瓷与漫反射建筑表面，温润、舒适、柔和。*
- **Canvas (背景)**: `#F6F7F9` (柔和温润微灰，消除苍白反光)
- **Surface (卡片/弹窗)**: `#FFFFFF` (纯白卡片与浮层)
- **Subtle (输入框/次级背景)**: `#EDF0F4`
- **Border (边框分割)**: `#E2E5EA` (柔和微灰分界线)
- **Text Primary (主文字)**: `#272A30` (柔和深石墨炭灰，消除生硬死黑)
- **Text Secondary (次要文字)**: `#6B7280` (舒缓中灰)
- **Text Tertiary (微弱文字)**: `#9CA3AF` (占位符与微弱数据)
- **Accent (强调色)**: `#1E293B` (雅致深石墨色)

### 3. ⚫ **Obsidian Dark (深曜黑 · 柔和深色)**
*灵感源自深空石墨暗夜与现代 IDE，层次分明，无高亮光晕与光污染。*
- **Canvas (背景)**: `#14161A` (深空石墨暗夜底色)
- **Surface (卡片/弹窗)**: `#1C1E24` (实体卡片)
- **Subtle (输入框/次级背景)**: `#21242C`
- **Border (边框分割)**: `#2B2F3A` (柔和暗部线框)
- **Text Primary (主文字)**: `#DCE0E8` (柔和银灰白，无刺目高亮)
- **Text Secondary (次要文字)**: `#8C93A1` (柔和中灰说明)
- **Text Tertiary (微弱文字)**: `#5C6374` (微弱等宽数据)
- **Accent (强调色)**: `#E2E7F0` (雅致冷银白)

---

## 2.2 状态与网络拓扑语义色 (Semantic Micro Colors)

状态色全部**降低饱和度、收敛面积**，仅作为 4px~6px 微型指示点或低对比度标签使用：

| 语义 | 作用 | 浅色值 (Light) | 深色值 (Dark) | 呈现方式 |
| :--- | :--- | :--- | :--- | :--- |
| **Intranet (内网最优)** | 命中最优局域网 IP / 低延迟 | `#16A34A` (Sage Green) | `#22C55E` | 4px 静音绿点 + 灰色等宽字 |
| **Extranet (公网备用)** | 走公网域名 / 云端出口 | `#2563EB` (Cobalt Blue) | `#38BDF8` | 4px 蓝点或灰色空心点 |
| **Warning (延迟偏高/重复)** | 探测耗时 > 500ms 或疑似重复 | `#D97706` (Muted Amber) | `#FBBF24` | 琥珀微标 |
| **Offline (不可达)** | 探测失败 / 离线 | `#DC2626` (Muted Red) | `#F87171` | 4px 灰色空心点或淡红标 |

---

## 2.3 完整的 CSS 自定义属性变量表 (CSS Variables)

```css
/* ==========================================================================
   Smart Bookmark - 极简主义设计变量系统 (CSS Design Tokens)
   ========================================================================== */

:root, [data-theme="obsidian-dark"] {
  /* 基础画布与容器 */
  --bg-canvas: #14161a;
  --bg-surface: #1c1e24;
  --bg-surface-hover: #252830;
  --bg-subtle: #21242c;
  --bg-input: #1c1e24;

  /* 边框与分割线 */
  --border-subtle: #2b2f3a;
  --border-focus: #545b6d;

  /* 文字灰阶 */
  --text-primary: #dce0e8;
  --text-secondary: #8c93a1;
  --text-tertiary: #5c6374;

  /* 品牌与强调色 */
  --accent: #e2e7f0;
  --accent-fg: #14161a;
  --accent-hover: #cbd5e1;

  /* 网络状态微标颜色 */
  --status-intranet: #22c55e;
  --status-extranet: #38bdf8;
  --status-warn: #fbbf24;
  --status-danger: #f87171;

  /* 阴影（极轻微，仅用于悬浮或弹窗） */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.25);
  --shadow-md: 0 4px 12px 0 rgb(0 0 0 / 0.35);
  --shadow-popover: 0 12px 32px -4px rgb(0 0 0 / 0.5);

  /* 几何与度量 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}

[data-theme="ceramic-light"] {
  --bg-canvas: #f6f7f9;
  --bg-surface: #ffffff;
  --bg-surface-hover: #f0f2f5;
  --bg-subtle: #edf0f4;
  --bg-input: #ffffff;

  --border-subtle: #e2e5ea;
  --border-focus: #9499a3;

  --text-primary: #272a30;
  --text-secondary: #6b7280;
  --text-tertiary: #9ca3af;

  --accent: #1e293b;
  --accent-fg: #ffffff;
  --accent-hover: #334155;

  --status-intranet: #16a34a;
  --status-extranet: #2563eb;
  --status-warn: #d97706;
  --status-danger: #dc2626;

  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 12px 0 rgb(0 0 0 / 0.06);
  --shadow-popover: 0 12px 32px -4px rgb(0 0 0 / 0.12);
}

[data-theme="paper-sand"] {
  --bg-canvas: #f5f2eb;
  --bg-surface: #faf8f5;
  --bg-surface-hover: #f0ebe1;
  --bg-subtle: #eae5db;
  --bg-input: #faf8f5;

  --border-subtle: #ddd7cd;
  --border-focus: #b5ada0;

  --text-primary: #2d2b28;
  --text-secondary: #756f68;
  --text-tertiary: #a8a196;

  --accent: #3a5a40;
  --accent-fg: #ffffff;
  --accent-hover: #2f4934;

  --status-intranet: #2d6a4f;
  --status-extranet: #2a6f97;
  --status-warn: #b07d2b;
  --status-danger: #b93c3c;

  --shadow-sm: 0 1px 2px 0 rgb(45 43 40 / 0.04);
  --shadow-md: 0 4px 12px 0 rgb(45 43 40 / 0.06);
  --shadow-popover: 0 12px 32px -4px rgb(45 43 40 / 0.1);
}
```
