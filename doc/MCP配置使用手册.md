语言 / Languages: [English](./en/mcp-config-guide.md)

# Smart Bookmark MCP 配置使用手册

MCP（Model Context Protocol）服务用于把 **Smart Bookmark** 浏览器扩展里的书签、分组、标签及网络拓扑信息，通过标准 MCP 接口安全暴露给各类 AI 客户端（Cursor、Claude Desktop、Windsurf、VS Code、CherryStudio、Dify、NextChat、FastGPT 等）。

---

## 🌟 核心特性与架构升级

1. **Native Messaging 深度集成**：浏览器扩展通过 Chrome / Edge 原生消息传递（`chrome.runtime.connectNative`）静默拉起本地 Node 宿主，直接运行在后台 Service Worker 中，**无需长期打开 NewTab 前台页面**。
2. **多协议原生支持**：
   - **Streamable HTTP / SSE**：监听 `http://127.0.0.1:8333/mcp` 与 `/sse`，专为 Web 界面或桌面客户端（CherryStudio、Dify 等）打造。
   - **Stdio 透明代理**：提供 `smart-bookmark-mcp stdio` 命令，专为代码编辑器（Cursor、Claude Desktop 等）打造。
3. **跨平台全自动注册**：一键写入 Windows 注册表（HKCU）、macOS 与 Linux 清单文件，同时支持 Chrome 与 Edge。

---

## 一、前置条件

- 已安装 **Node.js ≥ 20.12**（在终端中运行 `node -v` 验证）
- 已在 Chrome 或 Edge 浏览器中安装 **Smart Bookmark** 扩展

---

## 二、快速接入（推荐三步走）

### 第一步：一键注册 Native 宿主

在系统终端中运行一次注册命令：

```bash
npx -y @ludengke95/smart-bookmark-mcp register
```

> **注册成功提示**：终端将输出各浏览器配置文件的写入路径。首次注册后建议**完全重启 Chrome 或 Edge 浏览器**。

---

### 第二步：在扩展中启用 MCP 服务

1. 打开 Smart Bookmark 扩展的新标签页或 Popup 弹窗。
2. 点击右上角「设置」图标 → 切换至「MCP 协议」选项卡。
3. 开启「启用 MCP 宿主服务」开关（状态指示灯变为绿色脉冲：`Native 活跃`）。
4. （可选）在高级设置中配置端口（默认 `8333`）或开启「允许局域网访问」。

---

### 第三步：配置 AI 客户端

根据你使用的 AI 客户端类型选择对应的配置方式：

#### 方式 A：代码编辑器（Cursor / Claude Desktop / Windsurf）

通过 Stdio 模式接入，直接将下方 JSON 配置写入客户端的配置文件：

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "stdio"]
    }
  }
}
```

**常见编辑器配置文件路径：**
- **Cursor**：`<项目根>/.cursor/mcp.json` 或全局 `~/.cursor/mcp.json`
- **Claude Desktop**：
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- **VS Code (Copilot / MCP)**：`<项目根>/.vscode/mcp.json`
  ```json
  {
    "servers": {
      "smart-bookmark": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@ludengke95/smart-bookmark-mcp", "stdio"]
      }
    }
  }
  ```
- **Windsurf**：`~/.codeium/windsurf/mcp_config.json`
- **WorkBuddy**：`~/.workbuddy/mcp.json`（写入后至「连接器管理」点击「信任」）

---

#### 方式 B：桌面 / Web AI 客户端（CherryStudio / Dify / FastGPT）

通过 **Streamable HTTP** 模式接入：

- **MCP 服务端点 URL**：`http://127.0.0.1:8333/mcp`
- **传输协议 (Transport)**：`Streamable HTTP` 或 `SSE`
- **JSON 格式（如适用）**：
  ```json
  {
    "mcpServers": {
      "smart-bookmark": {
        "url": "http://127.0.0.1:8333/mcp"
      }
    }
  }
  ```

---

## 三、交互式安装向导（可选）

不想手动查找并编辑配置文件？可直接运行交互式向导，按提示选择客户端与范围，向导将自动写入对应文件：

```bash
npx -y @ludengke95/smart-bookmark-mcp install
```

非交互 / CI 脚本用法：

```bash
# 为 Claude Desktop 和 WorkBuddy 自动写入全局配置
npx -y @ludengke95/smart-bookmark-mcp install --target claude,workbuddy --location global --yes

# 查看全部支持的参数
npx -y @ludengke95/smart-bookmark-mcp install --help
```

---

## 四、高级设置与局域网访问

### 自定义端口

若 `8333` 端口冲突，可在 Smart Bookmark 扩展「设置」→「MCP 协议」→「高级设置」中修改端口为自定义数值（如 `9000`）。修改后：
- Streamable HTTP 客户端将 URL 修改为 `http://127.0.0.1:9000/mcp`。
- Stdio 客户端在 `args` 末尾追加 `"--port", "9000"`。

### 局域网 / LAN 使用

默认情况下，HTTP 服务仅监听本机回环地址 `127.0.0.1`。如需允许同局域网内其他设备接入：

1. 在扩展 MCP 高级设置中勾选「允许局域网访问」（此时服务端将监听 `0.0.0.0:8333`）。
2. 在其他设备的 AI 客户端中，将 `127.0.0.1` 替换为本机的局域网 IP（例如 `http://192.168.1.50:8333/mcp`）。

> ⚠️ **安全警告**：局域网开放意味着同网段设备均可调用 MCP 工具读写你的书签数据。请仅在受信任的家庭或公司内网中使用，切勿将端口映射至公网。

---

## 五、健康检查与连接验证

1. **服务探活**：在浏览器中直接访问 `http://127.0.0.1:8333/ping`，若正常将返回：
   ```json
   {
     "status": "ok",
     "uptime": 12.34,
     "version": "1.0.3",
     "service": "smart-bookmark-mcp"
   }
   ```
2. **客户端验证**：重启对应 AI 客户端后，在工具列表（Tools）中即可看到 `list_bookmarks`、`create_bookmark`、`batch_organize_bookmarks` 等 17 个全量书签治理工具。

---

## 六、常见问题排查 (FAQ)

**1. 客户端显示无法连接或工具列表为空？**
- 检查浏览器扩展设置中的「启用 MCP 宿主服务」开关是否已打开。
- 确认 Chrome / Edge 浏览器处于运行状态（关闭浏览器后 Native Host 进程会随之退出）。
- 首次执行 `register` 命令后，请完全退出并重启一次浏览器以使注册表/清单生效。

**2. 启动报 `command not found: smart-bookmark-mcp`？**
- 若未全局安装包，请使用 `npx -y @ludengke95/smart-bookmark-mcp ...`；若希望使用裸命令，请执行 `npm install -g @ludengke95/smart-bookmark-mcp`。

**3. 如何卸载 Native 宿主？**
- 执行 `npx -y @ludengke95/smart-bookmark-mcp unregister` 即可从系统中彻底注销 Chrome 与 Edge 的宿主清单。
