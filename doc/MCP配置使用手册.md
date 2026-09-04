语言 / Languages: [English](./en/mcp-config-guide.md)

# Smart Bookmark MCP 配置使用手册

MCP（Model Context Protocol）桥接服务，用于把 **Smart Bookmark** 浏览器扩展里的书签 / 分组 / 标签，通过标准 MCP 接口暴露给 AI 客户端（Cursor、Claude Desktop、Windsurf、VS Code、WorkBuddy 等）。

桥接器在本地以零依赖 Node.js 进程运行，负责把 AI 客户端的 MCP JSON-RPC 调用（通过 stdio）转发到扩展（通过本地 WebSocket）。**它本身不存储、也不读取你的书签**，数据始终由扩展持有。

> ⚠️ 前置条件：扩展必须已安装。桥接器只是代理，扩展不在线时无法返回书签数据。

## 一、前置条件

- 已安装 **Node.js ≥ 20.12**（运行 `node -v` 确认；桥接的交互向导依赖 `@clack/prompts`）
- 已安装 **Smart Bookmark** 扩展

## 二、安装与运行

无需构建、无需提前安装依赖。MCP 桥接器有两种安装方式，**推荐全局安装**（bin 落在系统 PATH，客户端配置更简洁、启动更快，无需每次联网拉包）：

### 方式一（推荐）：全局安装后启动

```bash
npm install -g @ludengke95/smart-bookmark-mcp
smart-bookmark-mcp server
```

- 安装一次、全局可用：AI 客户端配置里可直接写 `command: "smart-bookmark-mcp"`，由裸命令启动。
- 启动即运行，不再每次从 npm 拉取。

### 方式二（手动）：npx 临时拉起

```bash
npx -y @ludengke95/smart-bookmark-mcp server
```

- 无需提前安装，但每次启动会从 npm 拉取最新版（需联网、且包已发布）。
- 适合临时试用：AI 客户端配置里用 `command: "npx"` + `args: ["-y", "@ludengke95/smart-bookmark-mcp", "server"]`，由 npx 自动解析，不依赖全局 PATH。

> `smart-bookmark-mcp` 是一个带子命令的 CLI：`server` 启动桥接服务（默认即启动，可省略），`install` 启动交互式配置向导（按提示选择语言 / 客户端 / 范围 / 局域网，自动写入配置并打印片段）。

### 交互式配置向导（一键写入客户端配置）

不想手动改配置文件？用内置向导自动完成：终端里依次问「语言 → 要配置的客户端（可多选）→ 安装范围 → 是否启用局域网」，然后**直接把配置写进对应文件**，最后再打印一份通用 JSON 供复制。

```bash
smart-bookmark-mcp install
```

会话示例（中文）：

```
交互语言 / Language            → 中文
要配置的客户端（可多选）        → Claude Desktop, WorkBuddy
安装范围？                     → 全局（用户级）
是否启用局域网访问？            → 否 / No
→ 写入 ~/.workbuddy/mcp.json 等，并打印通用 mcpServer JSON
```

非交互 / CI 用法（用参数代替问答）：

```bash
# 指定客户端（id 或编号，逗号分隔；all/auto/none）+ 范围 + 默认确认
smart-bookmark-mcp install --target claude,workbuddy --location global --yes

# 启用局域网（桥接监听 0.0.0.0）
smart-bookmark-mcp install --target all --location global --lan --yes

# 查看全部参数
smart-bookmark-mcp install --help
```

参数一览：

| 参数 | 说明 |
| --- | --- |
| `--target <ids>` | 要配置的客户端：`all` / `auto` / `none`，或逗号分隔的 id（如 `claude,workbuddy`）/ 编号（如 `1,6`）；缺省为交互选择 |
| `--location global\|project` | 安装范围：全局（用户级）或项目级（当前目录）；缺省交互选择 |
| `--lan` / `--no-lan` | 启用 / 关闭局域网（桥接监听 `0.0.0.0`） |
| `--yes` | 全部使用默认值、无提示（CI / 脚本） |
| `--help` | 显示帮助 |

> 向导写入的片段使用 `command: "npx"`（对未全局安装的用户也兼容）。若已按「方式一」全局安装，可把 `command` 手动改为 `smart-bookmark-mcp`（并去掉 `npx`、`-y`）。

### 启动参数 / 环境变量

| 参数 / 环境变量     | 默认值       | 说明               |
| ------------------ | ------------ | ------------------ |
| `--host <host>`    | `127.0.0.1`  | WebSocket 监听地址 |
| `--port <port>`    | `8333`       | WebSocket 监听端口 |
| `HOST`（环境变量） | `127.0.0.1`  | 同上               |
| `PORT`（环境变量） | `8333`       | 同上               |

示例：

```bash
smart-bookmark-mcp server --host 127.0.0.1 --port 9000
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server", "--port", "9000"]
    }
  }
}
```

或设置环境变量 `PORT=9000`、`HOST=127.0.0.1`。

### 局域网 / LAN 使用（允许，但不推荐）

默认 `--host 127.0.0.1` 仅监听本机回环，本机上的 AI 客户端、扩展、桥接器三者才能互通。若要让同一局域网内**其他机器**上的扩展或 AI 客户端连到桥接器，需把监听地址改为具体 LAN IP 或 `0.0.0.0`：

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server", "--host", "0.0.0.0", "--port", "8333"]
    }
  }
}
```

> ⚠️ **不推荐，且必须注意**：当前版本**无任何客户端鉴权**。桥接器一旦绑定非本机地址（`0.0.0.0` 或 LAN IP），局域网内任意主机都能直接读写你的书签，且无法区分来源。如确有局域网需求，请遵循：
>
> - **优先绑定具体的本机 LAN IP**（如 `192.168.1.50`），而非 `0.0.0.0`——后者对所有网卡生效，存在被更大网络看到的风险。
> - 配合防火墙**仅放行**该端口给受信任的局域网段，切勿映射到公网或路由器 DMZ。
> - 启用 LAN 后，扩展侧需同步：把扩展的 `wsHost` 从 `127.0.0.1` 改为桥接器所在机器的 LAN IP（如 `ws://192.168.1.50:8333`），否则扩展仍连本机、连不上。

保持默认 `127.0.0.1` 仍是推荐做法——端口仅在你本机范围内可见，安全边界最小。

## 五、验证连接

1. 保存配置后**完全重启**对应 AI 客户端。
2. 在客户端的 MCP / 工具面板中，应能看到 `smart-bookmark` 服务，且工具列表出现书签相关工具。
3. 若扩展尚未连接（需在设置页面手动开启 MCP 并填好 IP/端口才会连接），`tools/list` 会返回**空目录**（不会报错），扩展连上后会自动发送 `notifications/tools/list_changed` 通知客户端刷新。

## 六、常见问题

**1. 启动报 `ENOENT` / `command not found`**
你用了裸命令 `smart-bookmark-mcp`，但全局并未安装该 bin，或 bin 不在客户端进程的 PATH 中。
→ 先确认已全局安装：`npm install -g @ludengke95/smart-bookmark-mcp`，并保证 bin 在客户端进程的 PATH 中（推荐，见「二、安装与运行」）。若不想全局安装，可改用 `"command": "npx"` + `"args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]`，由 npx 自动解析，不依赖 PATH。

**2. 工具列表为空**
→ 最常见原因：**浏览器扩展默认不启用 MCP 连接**。请到扩展的「设置」页面手动开启 MCP，并填写与桥接器一致的通信 IP 与端口（默认 `127.0.0.1` / `8333`；局域网场景填桥接器所在机器的 LAN IP，见「四、局域网使用」）。确认扩展已安装、MCP 已开启后，桥接器连上会主动推送 `notifications/tools/list_changed` 让客户端刷新工具列表。

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
