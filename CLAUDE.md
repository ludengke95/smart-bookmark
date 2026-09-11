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

- 解决同一应用内网/外网入口不同需手动判断的痛点（WebRTC 内网 IP 嗅探 + 32 位二进制 XOR 最长公共前缀匹配 + 并发短超时连通性探针与毫秒级降级）。
- 本地 Local-First 存储架构（Dexie.js / IndexedDB），免 Key 网页大模型与 API 双模 AI 智能整理，多维排序，3 套极简主题，快照容灾。
- 引擎框架：**WXT 0.21** + **Svelte 5 (Runes)** + **Tailwind CSS 3.4** + **Dexie 4.x** + **Manifest V3**。
- MCP 生态：根目录独立子包 `packages/smart-bookmark-mcp` 为 Cursor / Claude Desktop / Windsurf 等提供 Native Messaging、Stdio 与 Streamable HTTP 桥接。

## 常用命令

```bash
# 安装根依赖
npm install

# 开发模式（自动加载扩展到独立 Chrome，支持 HMR）
npm run dev
npm run dev:firefox        # Firefox 适配开发

# 构建与打包
npm run build              # 构建至 .output/chrome-mv3
npm run zip                # 打包为可分发 zip 至 .output/
npm run compile            # 仅类型/语法编译检查

# 本地 MCP 桥接（运行根目录桥接脚本）
npm run mcp

# 多包版本同步与变更日志
npm run version:sync       # 同步根目录与 packages/smart-bookmark-mcp 版本号
npm run release:notes      # 基于 conventional-changelog 生成版本说明

# 核心测试与验证
node test/verify-core.js   # 核心寻径算法（XOR 前缀、IP 转换、CIDR 分类）纯逻辑冒烟

# MCP 子包测试（CI 运行项）
cd packages/smart-bookmark-mcp && npm test
```

## 架构分层与核心机制

代码按「**纯函数服务与存储层 → 全局响应式状态 → UI 组件**」三层解耦组织：

### 1. `src/services/` —— 核心服务与算法

- `xor-matcher.js` —— 32 位二进制 XOR 前缀寻径 + 拓扑分类（核心签名算法）
- `ip-detector.js` —— WebRTC 本地内网 IP 嗅探
- `ping-probe.js` —— 并发短超时可达性探针 + 延迟测速
- `bookmark-sort.js` —— 5 种排序比较器纯函数（自定义、访问热度、名称、测速、添加时间）
- `favicon-fetcher.js` / `icons-library.js` —— 图标抓取与离线矢量库
- `errors.js` —— 结构化错误码工厂（`serviceError`）
- `storage/` —— **Dexie.js (IndexedDB) 本地存储引擎**：
  - `db.js`：`SmartBookmarkDB` 实例，管理 6 张核心表（`bookmarks`, `tags`, `groups`, `dailyClicks`, `bookmarkStats`, `snapshots`, `appSettings`）。内置 DBCore 中间件，自动对所有写入对象执行 `deepCloneToRaw`，防止 Svelte 5 Runes `$state` Proxy 引发 `DataCloneError`。
  - `tag.js`：标签独立实体存储管理，支持与书签的 tagIds / tags 双向联动与级联治理。
  - `sync.js`：基于 `BroadcastChannel`（`smart_bookmark_sync_channel`）实现跨 NewTab 标签页、Popup 弹窗与 Service Worker 之间的毫秒级状态同步。
  - `bookmark.js` / `group.js` / `stats.js` / `backup.js` / `ai.js`：领域存储模块。
  - `index.js`：模块统一导出。**新增业务代码请直接按域或从 `services/storage/index.js` 导入**。
- `ai/` —— AI 整理流水线（免 Key 网页提示词构建、OpenAI/DeepSeek/Ollama API 客户端驱动）
- `mcp/` —— 扩展端 MCP Native Messaging 与保活服务（`native-host.js` / `tools.js` / `keepalive.js`）

### 2. `src/state/` —— Svelte 5 全局响应式状态

- `app.svelte.js` —— 核心单例 `AppState`（Runes `$state` / `$derived`），**唯一数据出口**：
  - 维护书签、分组、标签、设置、点击统计、探针缓存、网络状态、搜索状态等。
  - **严禁在 Svelte 组件内使用 `$state` 保存业务数据副本**，必须统一通过 `appState` 读写。
- `toast.svelte.js` —— 全局 Toast 反馈单例

### 3. `src/components/` —— UI 组件

- `common/` —— 通用组件规范：
  - **所有弹窗必须使用 `ModalShell` 作为外壳**。
  - 表单使用 `ToggleRow`、`SelectRow`、`Select`、`ActionButton` 等统一规范组件。
- `newtab/` —— 新标签页视图（TopNav、HeroSearch、BookmarkGrid、TagPills、BookmarkCard）。
- `modals/` —— 模态弹窗（BookmarkModal、ImportModal、AiOrganizeModal、AiResultModal、StatsModal、BackupModal、SettingsModal + `settings/` 分页）。

### 4. `src/entrypoints/` —— WXT 入口

- `background.js` —— Service Worker（生命周期、探针保活与跨页面事件调度）
- `home/` —— 新标签页（index.html + main.js + App.svelte）
- `popup/` —— 工具栏快捷弹窗

### 5. `src/i18n/` —— 多语言引擎

- Runes 响应式 `t()`，切换语言即时生效。
- 拆分组织于 `locales/{zh-CN,en-US}/{common,modals,newtab,ai-prompt}.js`。
- **所有 UI 文案与 AI 提示词严禁硬编码中/英文字符串**，必须统一配置 i18n 键值。

### 6. `src/constants/index.js`

全局常量定义：系统内置组 ID（`PINNED_GROUP_ID`、`UNGROUPED_GROUP_ID`）、默认搜索引擎、3 套主题、备份策略、网络探针参数与 MCP 默认端口。

## 核心设计与交互规范（来自 `doc/前端设计规范.md`）

1. **弹窗尺寸恒定**：同一弹窗在 Tab 切换/表单展开/异步加载时尺寸**绝对保持恒定**。使用 `h-[xxx] flex flex-col` 固定高度 + 内部 `flex-1 overflow-y-auto` 消化动态内容，**严禁弹窗高度随内容跳变**。
2. **紧凑无滚动条优先**：控制弹窗总高不超过屏幕高度 80%，优先确保一屏完整展示核心信息，仅在长列表时触发内部局部滚动。
3. **禁止原生破坏体验组件**：严禁原生 `title="..."` Tooltip、原生 `<select>` 下拉框、原生 `alert()/confirm()` 对话框。必须使用 `Select` 组件、浮层 Popover 以及应用内 `ConfirmModal`。
4. **主题 Token 驱动**：所有 UI 样式必须使用主题色 Token（如 `bg-surface`、`text-text-primary`、`accent` 等），不允许硬编码 HEX 颜色。`tailwind.config.js` 已完整映射主题 CSS 变量。
5. **书签分组三体系**：
   - `PINNED_GROUP_ID`（常用）：按访问热度动态聚合，**不可作为导入/添加时的目标自定义组**。
   - 用户自定义分组：支持拖拽排序、折叠与重命名。
   - `UNGROUPED_GROUP_ID`（未分组）：无归属时的兜底分组。
6. **自适应选择器**：选项数 N ≤ 2 时自动呈现 Segmented Control，N > 2 时采用卡片式 Popover。
7. **结构化错误**：业务异常统一使用 `serviceError` 工厂产出 `{ code, message }`，**禁止抛出裸字符串错误**。
8. **数据写入脱敏安全**：存入 IndexedDB 前需通过 `deepCloneToRaw` 清除 Svelte Runes 的 Proxy 包装，防止结构化克隆异常。

## Git 提交前检查

每次准备提交代码时，执行以下检查（可主动询问或预提交时触发）：

1. **检查是否有远程跟踪分支**
   - 执行 `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
   - 成功 → 输出“已有远程分支，无需处理”并结束。
   - 失败 → 继续。

2. **检查是否在 worktree 中**
   - 执行 `git rev-parse --git-dir`，看路径是否含 `.git/worktrees/`
   - 否 → 输出“非 worktree，无需二次命名”并结束。
   - 是 → 继续。

3. **检查仓库是否有分支命名规范**
   - 在仓库根目录查找命名规范材料
   - 不存在 → 输出“无命名规范，不作处理”并结束。
   - 存在 → 阅读理解规范。

4. **重命名（需用户确认）**
   - 获取当前分支名 `git branch --show-current`，按规范生成新名称。
   - 向用户展示“旧名称 → 新名称”，询问是否执行（yes/no）。
   - 确认后执行 `git branch -m <新名称>`，输出结果；若重名则追加时间戳并再次确认。

> 仅修改本地分支名，不影响远程。若分支已符合规范，直接提示无需操作。
