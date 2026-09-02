# Smart Bookmark 智能书签与新标签页扩展

> 基于客户端网络拓扑智能寻径的多入口 Chrome 扩展（Manifest V3）。专为工程师与技术团队打造，自动识别内网/外网并在最优地址间极速跳转，采用 **Vite + Svelte 5 + Tailwind CSS + WXT** 现代化技术栈与极简主义设计规范。

---

## 🌟 核心功能特性

1. **一书签多入口（One Bookmark, Multiple Endpoints）**：
   - 每个书签支持配置多个访问地址（内网 IP、私有域名、外网公网域名）。
2. **拓扑智能寻径引擎（32-bit XOR Prefix Matching）**：
   - 自动识别私有 IP（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`127.0.0.0/8`）。
   - 基于客户端本机 IP 与各入口地址的 32 位二进制按位异或（XOR）最长公共前缀匹配深度，自动排序出最佳直连地址。
3. **并发短超时可达性探针（Ping Probe）**：
   - WebRTC STUN 极速探测本机局域网 IP，并发探针测速与持久化缓存。
4. **极简主义设计规范（Minimalist Design System）**：
   - 贯彻「形式追随功能、内容即界面、克制且精密」的设计理念。
   - 内置 3 款极简主题：
     - **陶瓷白 (`ceramic-light`)**：温暖纯净的浅色工作台
     - **黑曜石 (`obsidian-dark`)**：低反差高专注的暗黑模式
     - **沙丘纸 (`paper-sand`)**：低对比度护眼暖调
   - 精密等宽数字时钟 (`font-extralight`) 与胶囊聚合搜索。
5. **Popup 快捷弹窗（380px）**：
   - 秒级唤出，一键收藏当前网页或追加为现有书签的新入口。
6. **多维安全容灾与快照备份**：
   - 关键操作前自动快照、每日定时快照、快照加锁保护、一键回滚。
   - 支持 Chrome 导出的 HTML 书签与 JSON 完整备份的导入/导出，支持同名书签智能合并为多入口。

---

## 🚀 极速开发与启动

本项目基于 **WXT + Vite + Svelte 5**，支持启动时**自动打开专属 Chrome 浏览器**并实时热重载（HMR）。

### 1. 启动开发环境（自动打开 Chrome 浏览器）
```bash
npm run dev
```
> 执行后将自动拉起一个加载了本扩展的独立 Chrome 窗口，代码任何改动均会毫秒级实时生效！

### 2. 生产构建打包
```bash
# 编译 Chrome MV3 生产包至 .output/chrome-mv3
npm run build

# 打包为可发布的 zip 压缩文件至 .output/newtab-1.0.0-chrome.zip
npm run zip
```

---

## 📂 项目工程架构

```
newtab/
├── .output/                     # WXT 构建打包产物 (chrome-mv3)
├── doc/                         # 需求与设计规范文档
│   ├── 前端设计规范.md           # 极简设计系统单一度量基准
│   └── 书签应用-需求文档.md       # 业务逻辑与功能规格说明
├── public/                      # 静态资源 (图标等)
│   └── icons/                   # 16/32/48/128px 扩展图标
├── src/
│   ├── app.css                  # Tailwind CSS 与 3 套极简主题 CSS Tokens
│   ├── constants/               # 默认配置、搜索引擎、3套极简主题
│   ├── services/                # 纯函数业务核心服务
│   │   ├── xor-matcher.js       # 32位二进制按位异或前缀寻径与拓扑分类
│   │   ├── ip-detector.js       # WebRTC STUN 局域网 IP 嗅探
│   │   ├── ping-probe.js        # 并发可达性探针与延迟测速
│   │   ├── favicon-fetcher.js   # 站点图标与 Base64 转换
│   │   ├── storage.js           # 存储层、快照管理与 JSON 导入导出
│   │   └── icons-library.js     # 技术品牌离线矢量图标库
│   ├── state/                   # Svelte 5 全局响应式状态 (Runes)
│   │   ├── app.svelte.js        # 核心单例全局 Store ($state / $derived)
│   │   └── toast.svelte.js      # 轻量 Toast 反馈系统
│   ├── components/              # 极简 UI 组件库
│   │   ├── common/              # 通用组件 (IconRender, Toast)
│   │   ├── newtab/              # 新标签页视图 (TopNav, HeroSearch, BookmarkGrid, TagPills...)
│   │   └── modals/              # 模态弹窗 (BookmarkModal, ImportModal, SettingsModal...)
│   └── entrypoints/             # WXT 扩展入口
│       ├── background.js        # 后台 Service Worker
│       ├── newtab/              # 新标签页 (index.html, main.js, App.svelte)
│       └── popup/               # 快捷弹窗 (index.html, main.js, App.svelte)
├── package.json                 # 依赖配置
├── tailwind.config.js           # Tailwind 极简色彩与网格配置
└── wxt.config.js                # WXT 扩展构建配置 (Manifest V3)
```
