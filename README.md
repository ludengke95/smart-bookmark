# 智能书签 (Smart Bookmark) —— Chrome 浏览器插件

> 基于客户端网络拓扑智能寻径的多入口 Chrome 扩展（Manifest V3）。解决同一个应用内网/外网入口不同，每次都需要手动判断该点哪个地址的问题。

---

## 🌟 核心特性

1. **一书签多入口（One Bookmark, Multiple Endpoints）**：
   - 每个书签可绑定多个访问地址（内网 IP、私有域名、外网公网域名）。
2. **拓扑智能寻径引擎（32-bit XOR Prefix Matching）**：
   - 自动识别私有 IP（`10.x`、`172.16-31.x`、`192.168.x`）。
   - 基于客户端本机 IP 与内网地址的 32 位二进制按位异或（XOR）最长公共前缀匹配深度，自动排序出最佳内网直连地址。
3. **并发短超时可达性探针（Ping Probe）**：
   - 启动与网络变更触发 1.5s 短超时并发探测，结果持久化缓存；点击跳转前支持二次快速复验（保险模式）。
4. **高密度新标签页管理（New Tab Dashboard）**：
   - 顶部美化区：实时走字时钟（12/24H）、农历日期、可编辑座右铭。
   - 统一聚合搜索框：内嵌 Google / Bing / 百度 / GitHub 切换器，支持本地书签即时模糊匹配与回车网搜。
   - 4 档响应式布局密度：**紧凑卡片 (5~6列)**、**极简图标 (8列九宫格)**、**详细列表行**、**舒适大卡片** 一键自由切换。
   - 单栏流式可折叠分组：固定置顶金色星标「常用」分组 + 用户自定义可拖拽分组。
5. **Popup 快捷弹窗（380×560px）**：
   - 秒级唤出，全键盘上下键导航与 Enter 一键直达，支持一键添加当前标签页。
6. **5 套预设主题与数据分析**：
   - 内置 **Dark Slate**、**Clean Light**、**Cyber Indigo**、**Emerald**、**Sunset** 5 套预设主题。
   - 聚合近 7 天 / 近 30 天 / 全量点击统计图表与 Top 5 访问排行。

---

## 🚀 如何在 Chrome 中加载与调试运行

本插件采用 **原生模块化架构（Native ES Modules + Manifest V3）**，无需任何构建打包步骤，**即插即用**。

### 安装步骤：
1. 打开 Chrome 浏览器，在地址栏输入并进入：
   ```
   chrome://extensions/
   ```
2. 在页面右上角开启 **「开发者模式」(Developer mode)** 开关。
3. 点击左上角的 **「加载已解压的扩展程序」(Load unpacked)** 按钮。
4. 在弹出的文件选择窗口中，选择本项目的根目录：
   ```
   g:\java_workspace\newtab
   ```
5. 安装完成！点击浏览器右上角的扩展图标即可唤出 Popup 弹窗，或新建标签页体验完整管理大盘。

---

## 📂 项目工程结构

```
newtab/
├── manifest.json                    # Chrome 插件 Manifest V3 清单
├── background/
│   ├── service-worker.js            # 后台 Service Worker (调度/消息分发)
│   ├── ip-detector.js               # WebRTC 局域网 IP 自动探测
│   ├── xor-matcher.js               # 32位二进制 XOR 最长公共前缀匹配算法
│   ├── ping-probe.js                # 并发可达性探针与测速
│   └── favicon-fetcher.js           # 跨域站点 Favicon 自动抓取
├── common/
│   ├── constants.js                 # 预置书签、系统分组、搜索引擎与偏好
│   ├── storage.js                   # chrome.storage.local 数据持久化层
│   ├── theme.js                     # 5 套主题管理器
│   └── icons-library.js             # Simple Icons 品牌库与 Lucide 矢量图标
├── newtab/
│   ├── newtab.html                  # 新标签页管理主页
│   ├── newtab.css                   # 全局样式与 4 档密度排版栅格
│   └── newtab.js                    # 新标签页主控制器
├── popup/
│   ├── popup.html                   # 快捷弹窗 DOM
│   ├── popup.css                    # 弹窗 380x560px 样式
│   └── popup.js                     # 快捷过滤与键盘直达控制器
├── assets/
│   └── icons/                       # 16/32/48/128px 插件图标
├── 功能设计稿.html                   # 交互设计原型
└── 设计风格指南.md                   # 设计系统规范
```
