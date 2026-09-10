# Firefox 扩展适配体验优化与隐私寻径兜底方案

## 背景与痛点

在 Firefox 扩展（MV2 / MV3）环境下开发与运行 Smart Bookmark 时，面临以下环境差异与隐私安全限制：
1. **WebRTC mDNS 混淆导致局域网 IP 缺失**：
   Firefox 出于隐私保护规范（RFC 8828），默认开启 `media.peerconnection.ice.obfuscate_host_addresses`，纯 WebRTC 探测抛出的 ICE Candidate 均为匿名 `.local` 字符串，且 Firefox 不支持 Chrome 特有的 `chrome.system.network` API，导致前台无法直接获知本机局域网 IP。
2. **书签权限申请的手势丢失与提示误报**：
   Firefox 对 `permissions.request` 实行严格的用户激活手势校验（User Activation）。在异步回调或 `$effect` 中调用会被拦截，且若权限未准备好即调用扫描 API 会被异常捕获误判为“未授权”。
3. **开发模式 CSP 严格拦截**：
   Firefox 对扩展页面脚本的 CSP 限制更严格，开发服务器 HMR 探活或某些库调用需避免触发 `unsafe-eval` 违规警告。

---

## 解决方案与设计

### 1. 局域网 IP 探测的多层融合与优雅兜底
- **层级 1：本地 MCP 桥接获取（最精准）**：
  若用户启用了本地 MCP 桥接服务（`packages/smart-bookmark-mcp`），由 Node.js 宿主直接读取操作系统的 `os.networkInterfaces()` 并回传真实内网网卡 IP。
- **层级 2：纯测速模式自动兜底（Ping-Only Mode）**：
  在缺失本机 IP 的情况下，寻径算法平滑切换为纯连通性与高精度 RTT 延迟加权模式，耗时最短者直接高亮为最优入口。
- **层级 3：UI 友好提示与内网网段手动选填**：
  在左上角展示“隐私保护/纯测速”状态胶囊，点击弹出轻量 Popover，允许用户可选填自己的内网常用网段（如 `192.168.1.x`）并持久化到 IndexedDB。

### 2. 跨浏览器书签权限授权生命周期解耦
- **手势严格同步**：废弃弹窗打开时的异步隐式申请，将 `permissions.request` 严格绑定在用户明确点击“授权”按钮的原生同步事件上。
- **授权与扫描状态解耦**：授权成功先确立权限状态，再调用扫描；若读取书签树失败，独立提示“读取书签数据失败”，杜绝被误判并回退至未授权文件导入页。
- **API 兼容适配**：统一封装 `browser?.permissions || chrome?.permissions`。

---

## 影响范围与验收标准

1. **影响模块**：
   - `src/services/ip-detector.js`
   - `src/components/modals/ImportModal.svelte`
   - `src/state/app.svelte.js`
2. **验收标准**：
   - Firefox 环境下新标签页稳定加载，左上角友好展示寻径状态或 IP。
   - 打开书签导入弹窗无静默报错，点击“授权”按钮能正常弹出 Firefox 权限授权窗，授权后顺利扫描书签。
