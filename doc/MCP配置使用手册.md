语言 / Languages: [English](./en/mcp-config-guide.md)

# Smart Bookmark MCP 配置使用手册

MCP（Model Context Protocol）桥接服务，用于把 **Smart Bookmark** 浏览器扩展里的书签 / 分组 / 标签，通过标准 MCP 接口暴露给 AI 客户端（Cursor、Claude Desktop、Windsurf、VS Code、WorkBuddy 等）。

桥接器在本地以零依赖 Node.js 进程运行，负责把 AI 客户端的 MCP JSON-RPC 调用（通过 stdio）转发到扩展（通过本地 WebSocket）。**它本身不存储、也不读取你的书签**，数据始终由扩展持有。

> ⚠️ 前置条件：扩展必须已安装，且其 new-tab 页面保持打开。桥接器只是代理，扩展不在线时无法返回书签数据。

## 一、前置条件

- 已安装 **Node.js ≥ 18**（运行 `node -v` 确认）
- 已安装 **Smart Bookmark** 扩展，并保持其 new-tab 页面打开

## 二、安装与运行

无需构建、无需提前安装依赖。推荐用 `npx` 直接拉起（不依赖全局 PATH，最省心）：

```bash
npx -y @ludengke95/smart-bookmark-mcp
```

（可选）也可全局安装后直接用 bin 启动：

```bash
npm install -g @ludengke95/smart-bookmark-mcp
smart-bookmark-mcp
```

### 启动参数 / 环境变量

| 参数 / 环境变量     | 默认值       | 说明               |
| ------------------ | ------------ | ------------------ |
| `--host <host>`    | `127.0.0.1`  | WebSocket 监听地址 |
| `--port <port>`    | `8333`       | WebSocket 监听端口 |
| `HOST`（环境变量） | `127.0.0.1`  | 同上               |
| `PORT`（环境变量） | `8333`       | 同上               |

示例：

```bash
npx -y @ludengke95/smart-bookmark-mcp --host 127.0.0.1 --port 9000
```

在 WebSocket 端口上用浏览器访问 `http://127.0.0.1:8333` 会返回一个状态 JSON（`{ "name": "smart-bookmark-mcp-bridge", "status": "running", ... }`）。

## 三、在各 AI 客户端中配置

核心原则：所有客户端都是同一件事——在 `mcpServers`（或 `servers`）里加一项，让客户端用 stdio 拉起桥接器。**区别只在配置文件路径不同。**

通用写法（推荐）：

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp"]
    }
  }
}
```

### Claude Desktop

配置文件路径：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp"]
    }
  }
}
```

### Cursor

- 项目级：`<项目根>/.cursor/mcp.json`
- 全局：`~/.cursor/mcp.json`

（内容同上）

### VS Code（Copilot / MCP）

- 项目级：`<项目根>/.vscode/mcp.json`

```json
{
  "servers": {
    "smart-bookmark": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp"]
    }
  }
}
```

### Windsurf

- `~/.codeium/windsurf/mcp_config.json`

（使用与 Claude Desktop 相同的 `mcpServers` 格式）

### WorkBuddy

- `~/.workbuddy/mcp.json`

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp"]
    }
  }
}
```

> 写入配置后，到「连接器管理 → 自定义连接器」里点「信任」启用。

### Cline / Trae 等（可选）

- Cline：通过其 MCP 设置 UI 添加，或使用 `cline_mcp_settings.json`（格式同 `mcpServers`）。
- Trae：在 MCP 设置中添加 stdio 服务，命令与参数同上。

## 四、自定义 host / port

通过启动参数或环境变量均可：

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "--port", "9000"]
    }
  }
}
```

或设置环境变量 `PORT=9000`、`HOST=127.0.0.1`。

## 五、验证连接

1. 保存配置后**完全重启**对应 AI 客户端。
2. 在客户端的 MCP / 工具面板中，应能看到 `smart-bookmark` 服务，且工具列表出现书签相关工具。
3. 若扩展尚未连接，`tools/list` 会返回**空目录**（不会报错），扩展连上后会自动发送 `notifications/tools/list_changed` 通知客户端刷新。

## 六、常见问题

**1. 启动报 `ENOENT` / `command not found`**
你用了裸命令 `smart-bookmark-mcp`，但全局并未安装该 bin，或 bin 不在客户端进程的 PATH 中。
→ 改用 `"command": "npx"` + `"args": ["-y", "@ludengke95/smart-bookmark-mcp"]`，让 npx 自行解析，不依赖 PATH。

**2. 工具列表为空**
→ 确认扩展已安装，且其 new-tab 页面处于打开状态。

**3. 端口冲突 / 启动失败**
→ 换一个端口：`--port 9000`，或设置 `PORT` 环境变量。

**4. Node 版本过低**
→ 桥接器要求 Node.js ≥ 18，运行 `node -v` 确认并升级。

## 七、安全说明

- 桥接器仅监听本机 `127.0.0.1`，**请勿将端口暴露到公网**。
- 当前版本**不做客户端鉴权**（鉴权与按客户端路由为规划中功能），WebSocket 握手仅用于协议合规，不构成安全边界。详见项目 Roadmap。

## 八、相关文档

- 包 README（英文）：`packages/smart-bookmark-mcp/README.md`
- 桥接服务路由与鉴权设计：`doc/MCP桥接服务-路由与鉴权改造.md`
- 项目 Roadmap：`ROADMAP.md`
