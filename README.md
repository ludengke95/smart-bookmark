# 🌟 Smart Bookmark 智能书签与新标签页扩展

> **专为工程师与技术团队打造的智能书签与新标签页 Chrome 扩展（Manifest V3）。**
> 核心解决「同一个服务在内网/外网入口不同，每次都需要手动判断和切换地址」的痛点。基于客户端网络拓扑感知与 32 位二进制 XOR 算法实现智能最优寻径，同时集成免 Key 网页大模型 AI 智能整理、多维分类排序与三套高质感极简主题。

[![WXT](https://img.shields.io/badge/Extension-WXT_0.21-6C5CE7?style=flat-square)](https://wxt.dev)
[![Svelte 5](https://img.shields.io/badge/Framework-Svelte_5_(Runes)-FF3E00?style=flat-square)](https://svelte.dev)
[![Tailwind CSS](https://img.shields.io/badge/CSS-Tailwind_3.4-38B2AC?style=flat-square)](https://tailwindcss.com)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)](LICENSE)

---

## 🚀 核心特性

### 1. ⚡ 一书签多入口（One Bookmark, Multiple Endpoints）
- 每个书签条目支持绑定多个访问地址（内网直连 IP、VPN 专网地址、公网映射域名、备用节点等）。
- 告别为同一服务保存多个重复书签的混乱局面。

### 2. 🧠 32 位二进制 IP XOR 智能拓扑寻径引擎
- **内网环境自动探测**：基于 WebRTC 本地嗅探，秒级感知客户端本机局域网 IP 与网络环境变化。
- **最长公共前缀匹配**：将 IP 转换为 32 位二进制，通过按位异或（XOR）精确计算与本机 IP 的公共前缀深度，自动优选同网段/最近子网入口。
- **并发短超时探针与保险复验**：后台轻量探测连通性并缓存；点击书签瞬间快速复验，主入口不可达时毫秒级自动降级至可用备用入口，告别白屏超时。

### 3. ✨ 多模态 AI 智能书签整理与分类
- **网页大模型免 Key 模式（零成本）**：一键打包书签数据与结构化 Prompt，复制到任意大模型网页版（ChatGPT、Claude、Kimi、DeepSeek），支持**直接粘贴 JSON 结果**或**上传 JSON 文件**一键解析并应用全量重构分类。
- **API 直连模式**：支持配置 OpenAI / DeepSeek / 本地 Ollama 兼容端点，一键全自动整理。
- **MCP (Model Context Protocol) 支持**：支持与本地 AI 客户端/智能体环境联动。

### 4. 📊 5 种主页多维排序规则
- **↕ 自定义排序 (默认)**：支持在主页直接拖拽书签卡片调整顺序或跨分组迁移。
- **🔥 按访问热度**：按历史点击频次从高到低自动排序。
- **🔤 按书签名称**：按名称字母/拼音（A-Z）自然排序。
- **⚡ 按响应测速**：优先展示连通且网络延迟极低（极快/良好）的书签。
- **🕒 按添加时间**：按书签录入时间（最新优先）倒序排列。

### 5. 🎨 极简美学新标签页与多维管理
- **三套优雅极简主题**：
  - **纸本暖沙 (`paper-sand`)**：质朴墨色，温和护眼；
  - **陶瓷素白 (`ceramic-light`)**：温润骨瓷，明亮清新；
  - **深曜暗夜 (`obsidian-dark`)**：深空石墨，沉静暗黑。
- **三大分类体系**：
  - **「常用」动态组**：根据访问热度自动计算置顶呈现；
  - **「自定义分组」**：自由创建、排序与折叠；
  - **「未分组」**：未分类书签自动兜底聚合。
- **多选标签筛选**：按使用频次排序的热度标签栏，支持多标签联合过滤。
- **全能聚合搜索**：即时本地书签秒级检索 + 一键回车调用 Google / Bing / 百度 / GitHub 搜索引擎。

### 6. 🔒 纯本地安全架构（Local-First）与快照容灾
- 数据 100% 存储于本机（`chrome.storage.local`），无需注册，零云端上传。
- 支持关键操作前自动快照、每日快照与一键回滚。
- 完整支持浏览器原生书签一键导入（带疑似重复智能标记）与全量 JSON 备份/恢复。

---

## 🛠️ 快速开始

### 环境要求
- Node.js >= 18.0.0
- npm >= 9.0.0

### 1. 安装依赖
```bash
npm install
```

### 2. 启动开发环境（自动加载扩展并启动 Chrome）
```bash
npm run dev
```
> 执行后 WXT 会自动拉起一个加载了该扩展的独立 Chrome 窗口，支持代码热重载（HMR）。

### 3. 构建打包生产版本
```bash
# 构建 Chrome MV3 生产包至 .output/chrome-mv3
npm run build

# 打包为可分发的 zip 压缩包至 .output/
npm run zip
```

---

## 📂 项目工程架构

```
newtab/
├── .output/                     # WXT 构建产物
├── doc/                         # 项目文档
│   ├── 产品介绍.md               # 产品定位、解决痛点与架构亮点
│   ├── 用户使用手册.md           # 详尽的图文级用户实操手册
│   ├── 前端设计规范.md           # 极简设计系统色度与排版基准
│   └── 书签应用-需求文档.md       # 业务逻辑与详细功能规格说明
├── public/                      # 静态资源与扩展图标 (16/32/48/128px)
├── src/
│   ├── app.css                  # Tailwind CSS 与 3 套极简主题 CSS Tokens
│   ├── constants/               # 默认配置、搜索引擎、主题与排序选项定义
│   ├── services/                # 纯函数业务核心服务
│   │   ├── xor-matcher.js       # 32 位二进制 XOR 前缀寻径与拓扑分类
│   │   ├── ip-detector.js       # WebRTC 本地内网 IP 嗅探
│   │   ├── ping-probe.js        # 并发可达性探针与延迟测速
│   │   ├── favicon-fetcher.js   # 站点图标抓取与 Base64 处理
│   │   ├── storage.js           # 存储层、快照管理与 JSON 导入导出
│   │   ├── icons-library.js     # 技术品牌离线矢量图标库 (Simple / Lucide)
│   │   ├── ai/                  # AI 智能整理服务 (Prompt 构造、API 驱动)
│   │   └── mcp/                 # MCP 协议客户端通信
│   ├── state/                   # Svelte 5 全局响应式状态系统 (Runes)
│   │   ├── app.svelte.js        # 核心单例全局 Store ($state / $derived)
│   │   └── toast.svelte.js      # 轻量 Toast 反馈系统
│   ├── components/              # 极简 UI 组件库
│   │   ├── common/              # 通用组件 (IconRender, Select, Toast)
│   │   ├── newtab/              # 新标签页视图 (TopNav, HeroSearch, BookmarkGrid, TagPills, BookmarkCard...)
│   │   └── modals/              # 模态弹窗 (BookmarkModal, ImportModal, SettingsModal, AiOrganizeModal, BackupModal...)
│   └── entrypoints/             # WXT 扩展入口
│       ├── background.js        # 后台 Service Worker
│       ├── home/                # 新标签页 (index.html, main.js, App.svelte)
│       └── popup/               # 快捷弹窗 (index.html, main.js, App.svelte)
├── package.json
├── tailwind.config.js
└── wxt.config.js
```

---

## 📚 详细文档

- 📘 [产品介绍与架构分析](doc/产品介绍.md)
- 📖 [用户使用手册与 FAQ](doc/用户使用手册.md)
- 🎨 [前端设计与色彩规范](doc/前端设计规范.md)
- 📝 [需求与功能规格文档](doc/书签应用-需求文档.md)

---

## 📄 开源许可

本项目基于 [ISC License](LICENSE) 协议开源。
