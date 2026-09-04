# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 对话语言

始终使用中文（简体）与用户沟通，除非用户特别要求其他语言。

## CodeGraph 优先

仓库已建立 `.codegraph/` 索引（项目根目录可见）。在需要理解或定位代码时 **优先调用 `mcp__codegraph__codegraph_explore`**，而非 grep/Read 循环：

- 一个 `codegraph_explore` 调用即可拿到相关符号的逐行源码 + 调用路径，胜过多次 `Read` + `Grep`。
- 查询可传自然语言问题，也可传符号/文件名集合。
- 编辑代码前先用它查看目标函数与影响范围（blast radius）。

## 项目概览

**Smart Bookmark** —— 基于客户端网络拓扑智能寻径的多入口 Chrome 扩展（Manifest V3）。

- 同一个服务在内网/外网入口不同，本扩展自动选择最优地址（WebRTC 内网 IP 嗅探 + 32 位二进制 XOR 最长公共前缀匹配 + 并发可达性探针）。
- 集成免 Key 网页大模型 AI 智能整理、5 种排序规则、3 套极简主题、本地 Local-First 存储与快照容灾。
- 引擎框架：**WXT 0.21** + **Svelte 5 (Runes)** + **Tailwind CSS 3.4** + **Manifest V3**。

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式（自动加载扩展到独立 Chrome，支持 HMR）
npm run dev
npm run dev:firefox        # Firefox 适配开发

# 构建与打包
npm run build              # 构建至 .output/chrome-mv3
npm run zip                # 打包为可分发 zip 至 .output/
npm run compile            # 仅类型/语法编译检查

# 本地 MCP 桥接（用于 AI 客户端联动）
npm run mcp
```

无单测框架（未配置 vitest/jest）。`test/` 目录下是手动验证脚本（`verify-core.js`、`test-click-stats.js` 等），可通过 `node test/xxx.js` 跑核心逻辑冒烟，但**不属于自动化测试套件**。

## 架构分层

代码严格按「**纯函数服务层 → 全局响应式状态 → UI 组件**」三层组织：

### 1. `src/services/` —— 纯函数业务核心

所有与浏览器/存储副作用解耦的算法与工具：

- `xor-matcher.js` —— 32 位二进制 XOR 前缀寻径 + 拓扑分类（核心签名算法）
- `ip-detector.js` —— WebRTC 本地内网 IP 嗅探
- `ping-probe.js` —— 并发可达性探针 + 延迟测速
- `bookmark-sort.js` —— 5 种排序比较器纯函数
- `favicon-fetcher.js` / `icons-library.js` —— 图标抓取与离线矢量库
- `errors.js` —— 结构化错误码工厂（`serviceError`）
- `storage/` —— 按功能域拆分的存储层（base / bookmark / group / stats / backup / ai / index barrel）
- `storage.js` —— 兼容转发入口（旧 import 路径仍可工作，**新增代码请直接 import `services/storage/{module}`**）
- `ai/` —— AI 智能整理（organizer 流水线 / prompt-builder 提示词 / custom-engine OpenAI/DeepSeek/Ollama 驱动）
- `mcp/` —— Model Context Protocol WebSocket 客户端

### 2. `src/state/` —— Svelte 5 全局响应式状态

- `app.svelte.js` —— 核心单例 `AppState`（Runes `$state` / `$derived`），**唯一数据出口**：书签、分组、设置、点击统计、探针缓存、网络状态、MCP 状态、AI 进度等
- `toast.svelte.js` —— 轻量 Toast 反馈单例

所有跨组件共享数据必须经此层。**禁止在 Svelte 组件内 `$state` 持有业务数据副本**，应通过 `appState.xxx` 直接读写。

### 3. `src/components/` —— UI 组件

- `common/` —— 通用组件库（**所有弹窗必须使用 `ModalShell` 作为外壳**，表单使用 `ToggleRow` / `SelectRow` / `Select` / `ActionButton` 等统一规范组件）
- `newtab/` —— 新标签页视图（TopNav / HeroSearch / BookmarkGrid / TagPills / BookmarkCard）
- `modals/` —— 模态弹窗（BookmarkModal / ImportModal / AiOrganizeModal / AiResultModal / StatsModal / BackupModal / SettingsModal + `settings/` 子目录按 Tab 拆分）

### 4. `src/entrypoints/` —— WXT 入口

- `background.js` —— Service Worker
- `home/` —— 新标签页（index.html + main.js + App.svelte）
- `popup/` —— 工具栏弹窗

### 5. `src/i18n/` —— 多语言引擎

Runes 驱动的响应式 `t()`，界面语言切换即时刷新。`locales/{zh-CN,en-US}/{common,modals,newtab,ai-prompt}.js` 分模块组织，**所有 UI 文案与 AI 提示词都必须走 i18n**，禁止组件内硬编码中/英文字符串。

### 6. `src/constants/index.js`

全局默认配置：搜索引擎、3 套主题、备份策略、探测缓存 TTL、MCP 端口、AI 端点、系统内置组 ID（`PINNED_GROUP_ID` / `UNGROUPED_GROUP_ID`）。

## 关键约定（来自 `doc/前端设计规范.md`）

1. **弹窗尺寸恒定**：同一弹窗在 Tab 切换/表单展开/异步加载时尺寸**绝对不变**，使用 `h-[xxx] flex flex-col` 固定高度 + 内部 `flex-1 overflow-y-auto` 消化动态内容。**严禁弹窗高度随内容跳变**。
2. **紧凑无滚动条优先**：在控制总高度（不超过屏高 80%）的前提下，优先确保弹窗一屏完整呈现所有核心信息，仅在超长列表展开时自然触发内部局部滚动。
3. **禁止原生组件**：严禁 `title="..."` 原生 Tooltip、`<select>` 原生下拉、`alert()/confirm()` 原生对话框，必须使用 `Select` 组件、统一的浮层 Popover、应用内 `ConfirmModal`。
4. **主题深度契合**：所有 UI 元素必须使用主题色 Token（`bg-surface` / `text-text-primary` / `accent` 等），不允许写死 hex 颜色。`tailwind.config.js` 已映射所有 CSS 变量。
5. **书签分组三体系**：
   - `PINNED_GROUP_ID`（常用）—— 按访问热度动态聚合，**不可作为导入指定分组**
   - 用户自定义分组 —— 可指定
   - `UNGROUPED_GROUP_ID`（未分组）—— 无归属兜底，**不可作为导入指定分组**
6. **自适应选择器**：选项数 N ≤ 2 用 Segmented Control（`Select` 组件自动判定），N > 2 用卡片式 Popover。
7. **结构化错误**：业务失败必须使用 `serviceError` 工厂产出 `{code, message}`，**禁止抛中文裸字符串**。

## 存储层 import 规范

```js
// ✅ 新代码（推荐）
import { getBookmarks, saveBookmark } from '../services/storage/bookmark.js';
import { getGroups, saveGroup } from '../services/storage/group.js';

// ⚠️ 兼容旧路径（仍可用，但勿在新增代码中使用）
import { getBookmarks } from '../services/storage.js';
```

`services/storage.js` 仅为 barrel 转发，所有逻辑已下沉到 `services/storage/{base,bookmark,group,stats,backup,ai}.js`。
