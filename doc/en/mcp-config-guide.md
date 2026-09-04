Languages / 语言: [中文](../MCP配置使用手册.md)

# Smart Bookmark MCP — Configuration Guide

The MCP (Model Context Protocol) bridge exposes your **Smart Bookmark** browser extension's bookmarks / groups / tags to AI clients (Cursor, Claude Desktop, Windsurf, VS Code, WorkBuddy, …) through a standard MCP interface.

The bridge runs locally as a zero-dependency Node.js process and relays MCP JSON-RPC calls (over stdio) from the AI client to the extension (over a local WebSocket). **It does not store or read your bookmarks** — the extension always owns the data.

> ⚠️ Prerequisite: the extension must be installed and its new-tab page kept open. The bridge is only a proxy; it cannot return bookmark data while the extension is offline.

## 1. Prerequisites

- **Node.js ≥ 18** (verify with `node -v`)
- **Smart Bookmark** extension installed, with its new-tab page open

## 2. Install & Run

No build step, no pre-installed dependencies. Recommended: launch with `npx` (no global PATH needed):

```bash
npx -y @ludengke95/smart-bookmark-mcp
```

(Optional) Or install globally and run the bin:

```bash
npm install -g @ludengke95/smart-bookmark-mcp
smart-bookmark-mcp
```

### Flags / Environment variables

| Flag / Env         | Default      | Description                |
| ------------------ | ------------ | -------------------------- |
| `--host <host>`    | `127.0.0.1`  | WebSocket bind host        |
| `--port <port>`    | `8333`       | WebSocket bind port        |
| `HOST` (env)       | `127.0.0.1`  | Same as above              |
| `PORT` (env)       | `8333`       | Same as above              |

Example:

```bash
npx -y @ludengke95/smart-bookmark-mcp --host 127.0.0.1 --port 9000
```

A plain `GET http://127.0.0.1:8333` returns a status JSON (`{ "name": "smart-bookmark-mcp-bridge", "status": "running", ... }`).

## 3. Configure your AI client

Core idea: every client does the same thing — add one entry under `mcpServers` (or `servers`) so the client launches the bridge over stdio. **Only the config file path differs.**

Common form (recommended):

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

Config path:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

- Project: `<project>/.cursor/mcp.json`
- Global: `~/.cursor/mcp.json`

(same content as above)

### VS Code (Copilot / MCP)

- Project: `<project>/.vscode/mcp.json`

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

(uses the same `mcpServers` format as Claude Desktop)

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

> After writing the config, go to **Connector Management → Custom Connectors** and click **Trust** to enable it.

### Cline / Trae (optional)

- Cline: add via its MCP settings UI, or use `cline_mcp_settings.json` (same `mcpServers` format).
- Trae: add a stdio server in MCP settings with the same command/args.

## 4. Custom host / port

Via flags or env vars:

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

Or set `PORT=9000` / `HOST=127.0.0.1`.

## 5. Verify the connection

1. Fully restart the AI client after saving the config.
2. In the client's MCP / tools panel you should see the `smart-bookmark` server, and bookmark-related tools in the tool list.
3. If the extension is not yet connected, `tools/list` returns an **empty catalog** (no error); once it connects, the bridge sends `notifications/tools/list_changed` so the client refreshes automatically.

## 6. Troubleshooting

**1. `ENOENT` / `command not found` on launch**
You used the bare command `smart-bookmark-mcp`, but the bin is not installed globally or is not on the client process's PATH.
→ Use `"command": "npx"` + `"args": ["-y", "@ludengke95/smart-bookmark-mcp"]` so npx resolves it without relying on PATH.

**2. Empty tool list**
→ Confirm the extension is installed and its new-tab page is open.

**3. Port conflict / launch failure**
→ Pick another port: `--port 9000`, or set the `PORT` env var.

**4. Node version too old**
→ The bridge requires Node.js ≥ 18; verify and upgrade with `node -v`.

## 7. Security

- The bridge only listens on `127.0.0.1` locally — **do not expose the port to the public internet**.
- The current version performs **no client authentication** (per-client auth/routing is planned). The WebSocket handshake is protocol compliance only, not a security boundary. See the project Roadmap.

## 8. Related docs

- Package README: `packages/smart-bookmark-mcp/README.md`
- Bridge routing & auth design: `doc/en/mcp-bridge-routing-auth.md`
- Project Roadmap: `ROADMAP_EN.md`
