# @ludengke95/smart-bookmark-mcp

> **Languages**: [English](./README_EN.md) | 简体中文

**Smart Bookmark** Chrome 扩展的官方 MCP (Model Context Protocol) 本地桥接服务。

本服务允许各类主流大模型客户端（如 **Cursor**、**Claude Desktop**、**Windsurf**、**WorkBuddy** 等）通过标准化的 MCP 协议安全读取和管理你的书签、分组与标签。桥接服务作为轻量级本地 Node.js 进程运行，通过标准输入输出（Stdio）与大模型客户端通信，并通过本地 WebSocket 与 Smart Bookmark 浏览器扩展透明转发 JSON-RPC 调用。底层基于官方 [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) 与成熟的 [`ws`](https://www.npmjs.com/package/ws) 库构建。

> 必须在浏览器中安装并打开 Smart Bookmark 扩展的新标签页。桥接服务仅负责大模型客户端与扩展之间的通信桥接与代理，本身不在本地存储任何书签数据。

> 📘 完整图文配置教程请查阅：[../../doc/MCP配置使用手册.md](../../doc/MCP配置使用手册.md)

## 安装与启动

该 npm 包为纯原生 ESM 结构，无需额外构建步骤。安装时仅拉取 `@modelcontextprotocol/sdk` 和 `ws` 两个极轻量依赖。提供两种安装使用方式 —— **推荐使用全局安装**（可直接在 PATH 中使用 `smart-bookmark-mcp` 命令，启动更快）：

### 方式 1（推荐）：全局安装

```bash
npm install -g @ludengke95/smart-bookmark-mcp
smart-bookmark-mcp server
```

### 方式 2：按需免安装（npx）

```bash
npx -y @ludengke95/smart-bookmark-mcp server
```

> `smart-bookmark-mcp` 支持子命令调用：`server` 启动桥接服务（不带参数时的默认行为）；`install` 启动交互式配置向导，自动为你写入目标客户端的配置文件。

### 交互式自动配置向导

无需手动查找并编辑各 AI 客户端的 JSON 配置文件，直接运行向导即可 —— 支持选择 **语言 → 目标客户端（可多选）→ 配置范围（全局/项目级）→ 是否开启局域网监听**，自动将配置写入对应文件：

```bash
smart-bookmark-mcp install
```

非交互式 / CI 自动化形式：

```bash
smart-bookmark-mcp install --target claude,workbuddy --location global --yes
smart-bookmark-mcp install --target all --location global --lan --yes   # 开启局域网监听 (0.0.0.0)
smart-bookmark-mcp install --help
```

参数说明：`--target <ids>`（`all`/`auto`/`none` 或英文逗号分隔的客户端 ID）、`--location global|project`、`--lan`/`--no-lan`、`--yes`、`--help`。向导默认生成 `command: "npx"` 配置；若已全局安装，可直接将 command 改为 `smart-bookmark-mcp`。

### 启动选项（CLI Flags / 环境变量）

| 参数 / 环境变量    | 默认值         | 说明                                 |
| ----------------- | -------------- | ------------------------------------ |
| `--host <host>`   | `127.0.0.1`    | WebSocket 监听地址                   |
| `--host=<host>`   | `127.0.0.1`    | （等号传参形式）                     |
| `--port <port>`   | `8333`         | WebSocket 监听端口                   |
| `--port=<port>`   | `8333`         | （等号传参形式）                     |
| `HOST` (环境变量) | `127.0.0.1`    | WebSocket 监听地址                   |
| `PORT` (环境变量) | `8333`         | WebSocket 监听端口                   |

示例：

```bash
smart-bookmark-mcp server --host 127.0.0.1 --port 9000
```

服务启动后，直接向 WebSocket 端口发送 HTTP `GET` 请求会返回简单的健康检查 JSON 状态：
`{ "name": "smart-bookmark-mcp-bridge", "status": "running", ... }`。

## 配置接入 AI 客户端

将以下配置片段加入到对应 AI 客户端的 MCP 配置文件中。大模型客户端会在启动时自动通过 stdio 拉起桥接进程。

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
    }
  }
}
```

### Cursor (`.cursor/mcp.json` 或设置中的 MCP 面板)

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
    }
  }
}
```

### 自定义端口 / 远程主机

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server", "--port", "9000"]
    }
  }
}
```

## 工作原理

```
[大模型客户端 (AI Client)] --stdio(JSON-RPC)--> [mcp-bridge.js] --WebSocket--> [Smart Bookmark 扩展]
```

1. AI 客户端通过标准输入输出（stdio）启动桥接进程，桥接服务通过官方 `@modelcontextprotocol/sdk` 的 `Server` 与客户端进行 MCP JSON-RPC 交互。
2. 桥接服务在 `127.0.0.1:8333` 打开一个标准 RFC 6455 WebSocket 服务（基于 `ws` 库）。
3. Smart Bookmark 扩展连接到该 WebSocket 并运行扩展端 MCP 服务；桥接服务作为 MCP `Client`（通过定制 Transport）接入。
4. AI 客户端发起的 `tools/list` 和 `tools/call` 请求被透明转发到扩展端执行，执行结果再经由 stdout 写回给 AI 客户端。

### 扩展尚未打开时的表现

- `tools/list` 会返回空列表（`{ "tools": [] }`）而非报错，避免 AI 客户端在浏览器尚未启动时直接崩溃断开。
- 当扩展连接或断开时，桥接器会主动向 AI 客户端发送 `notifications/tools/list_changed` 通知，触发客户端自动重新拉取最新的工具目录。
- 若在扩展未连接时调用具体工具 `tools/call`，会返回友好的 `-32000` 错误提示。

## 支持的 MCP 工具列表

扩展端向接入的 AI 客户端宣告了以下 13 个 MCP 工具：

| 工具名称 (Tool) | 分类 | 说明 |
|---|---|---|
| `list_bookmarks` | 查询 | 查询书签列表，支持按关键词（书签名称/标签/多入口URL）、分组 ID、标签组合过滤，内置 `limit`（默认 50，最大 200）与 `offset` 分页保护。 |
| `get_groups` | 查询 | 获取所有自定义分组与内置分组（常用组、未分组），包含各分组的书签统计数与可分配标记。 |
| `get_tags` | 查询 | 获取所有已使用的标签、使用频次与点击统计，按使用热度降序返回。 |
| `create_bookmark` | 变更 | 创建新书签，支持配置主入口 URL、所属分组、标签列表与多入口网络拓扑（内网/外网/直连）。返回包含生成主键 `id` 的完整对象。 |
| `update_bookmark` | 变更 | 更新现有书签的标题、主入口 URL、多入口寻径列表、所属分组与标签（支持 `replace` 替换、`append` 追加、`remove` 移除三种模式）。 |
| `delete_bookmark` | 变更 | 根据书签 ID 删除单条书签，返回被删除书签的名称与 ID。 |
| `batch_delete_bookmarks` | 变更 | 根据 ID 数组批量删除多个书签，单次事务高效执行。 |
| `create_group` | 变更 | 创建新的自定义书签分组，直接返回创建好的分组详情及其 ID。 |
| `batch_organize_bookmarks` | 变更 | 批量执行书签智能重构：迁移分组与增删标签。执行前会自动生成一次安全快照防灾。 |
| `list_snapshots` | 容灾 | 查看历史安全备份快照列表（包含 ID、时间、备份原因、书签及分组计数）。 |
| `rollback_snapshot` | 容灾 | 一键将书签、分组与设置回滚恢复到指定快照，提供误操作兜底保障。 |
| `get_network_topology` | 系统 | 获取扩展探测到的本地局域网物理网卡信息、已探测内网 IP 列表及延迟测速缓存。 |
| `export_full_data` | 备份 | 导出包含所有书签、分组与设置的完整备份 JSON 数据。 |

## 连接验证

1. 修改并保存 AI 客户端配置后，**彻底重启 AI 客户端**。
2. 在客户端的 MCP / Tools 工具列表中应能看到 `smart-bookmark` 服务及上述书签工具。
3. 如果未打开扩展，工具列表显示为空；一旦在 Chrome 中打开 Smart Bookmark 新标签页，客户端将自动刷新并显现所有可用工具。

## 常见问题排查

- **启动报 `ENOENT` / `command not found`**：若配置中直接使用了命令名 `smart-bookmark-mcp`，请确保已全局安装 `npm install -g @ludengke95/smart-bookmark-mcp` 并已配置到 PATH；或者改用 `"command": "npx"` + `"args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]`。
- **工具列表为空**：请确认 Chrome 浏览器已安装 Smart Bookmark 扩展且**新标签页保持打开**。
- **端口冲突或启动失败**：换用其他端口启动，如添加参数 `--port 9000` 或配置环境变量 `PORT=9000`。
- **Node 版本过低**：桥接服务与安装向导要求 Node.js >= 20.12，请使用 `node -v` 检查版本。

## 安全提示

- 本地桥接器默认仅监听在 `127.0.0.1` 环回地址 —— **请勿将端口暴露至公网**。
- 当前版本未对本地 WebSocket 连接启用身份鉴权机制，WebSocket 握手仅用于协议规范合规。

## 运行环境要求

- Node.js >= 20.12
- 安装了 Smart Bookmark 扩展的 Chrome 浏览器，且新标签页处于开启状态。

## 开源协议

MIT License © ludengke95
