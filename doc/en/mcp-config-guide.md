Languages / 语言: [中文](../MCP配置使用手册.md)

# Smart Bookmark MCP — Configuration Guide

The MCP (Model Context Protocol) bridge exposes your **Smart Bookmark** browser extension's bookmarks / groups / tags to AI clients (Cursor, Claude Desktop, Windsurf, VS Code, WorkBuddy, …) through a standard MCP interface.

The bridge runs locally as a zero-dependency Node.js process and relays MCP JSON-RPC calls (over stdio) from the AI client to the extension (over a local WebSocket). **It does not store or read your bookmarks** — the extension always owns the data.

> ⚠️ Prerequisite: the extension must be installed. The bridge is only a proxy; it cannot return bookmark data while the extension is offline.

## 1. Prerequisites

- **Node.js ≥ 20.12** (verify with `node -v`; the interactive wizard depends on `@clack/prompts`)
- **Smart Bookmark** extension installed

## 2. Install & Run

No build step, no pre-installed dependencies. There are two ways to install the bridge — **global
install is recommended** (the bin lands on your PATH, so client configs are simpler and startup is
faster, with no per-launch download):

### Method 1 (recommended): global install then run

```bash
npm install -g @ludengke95/smart-bookmark-mcp
smart-bookmark-mcp server
```

- Install once, available everywhere: client configs can use `command: "smart-bookmark-mcp"` to launch the bare command.
- Runs immediately — no npm fetch on every launch.

### Method 2 (manual): npx on demand

```bash
npx -y @ludengke95/smart-bookmark-mcp server
```

- No install needed, but it fetches the latest published package from npm on every launch (requires network, and the package must be published).
- Good for a quick try: in client configs use `command: "npx"` + `args: ["-y", "@ludengke95/smart-bookmark-mcp", "server"]` so npx resolves it without relying on PATH.

> `smart-bookmark-mcp` is a subcommand CLI: `server` starts the bridge (also the default when run bare), and `install` launches the interactive setup wizard (choose language / client / scope / LAN, then auto-write configs and print snippets).

### Interactive setup wizard (auto-writes client configs)

Prefer not to edit config files by hand? Use the built-in wizard: it asks, step by step,
**language → clients to configure (multi-select) → scope → LAN access**, then **writes the
config straight into each selected client's file** and finally prints a universal JSON for copying.

```bash
smart-bookmark-mcp install
```

Example session (English):

```
Language                  → English
Clients to configure      → Claude Desktop, WorkBuddy
Install scope?            → Global (user-level)
Enable LAN access?        → No
→ writes ~/.workbuddy/mcp.json etc., then prints a universal mcpServer JSON
```

Non-interactive / CI usage (flags instead of prompts):

```bash
# specify clients (id or index, comma-separated; all/auto/none) + scope + defaults
smart-bookmark-mcp install --target claude,workbuddy --location global --yes

# enable LAN (bridge listens on 0.0.0.0)
smart-bookmark-mcp install --target all --location global --lan --yes

# show all flags
smart-bookmark-mcp install --help
```

Flags:

| Flag | Description |
| --- | --- |
| `--target <ids>` | Clients to configure: `all` / `auto` / `none`, or comma-separated ids (e.g. `claude,workbuddy`) / indices (e.g. `1,6`); defaults to interactive selection |
| `--location global\|project` | Install scope: global (user-level) or project (current dir); defaults to interactive selection |
| `--lan` / `--no-lan` | Enable / disable LAN (bridge binds `0.0.0.0`) |
| `--yes` | Use all defaults, no prompts (CI / scripting) |
| `--help` | Show help |

> The wizard writes snippets using `command: "npx"` (also works for users who did not install globally). If you installed globally (Method 1), you can change `command` to `smart-bookmark-mcp` (drop `npx` and `-y`).

### Flags / Environment variables

| Flag / Env         | Default      | Description                |
| ------------------ | ------------ | -------------------------- |
| `--host <host>`    | `127.0.0.1`  | WebSocket bind host        |
| `--port <port>`    | `8333`       | WebSocket bind port        |
| `HOST` (env)       | `127.0.0.1`  | Same as above              |
| `PORT` (env)       | `8333`       | Same as above              |

Example:

```bash
smart-bookmark-mcp server --host 127.0.0.1 --port 9000
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]
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
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "server", "--port", "9000"]
    }
  }
}
```

Or set `PORT=9000` / `HOST=127.0.0.1`.

### LAN use (allowed, but not recommended)

By default `--host 127.0.0.1` binds only to the loopback interface, so the AI client, the extension, and the bridge can talk only when they are all on the same machine. To let an extension or AI client on **another machine in the same LAN** reach the bridge, bind to a specific LAN IP or `0.0.0.0`:

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

> ⚠️ **Not recommended, and with caveats**: the current version has **no client authentication**. Once the bridge binds to a non-loopback address (`0.0.0.0` or a LAN IP), any host on the LAN can read and write your bookmarks directly, with no way to tell sources apart. If you truly need LAN access, follow these rules:
>
> - **Prefer binding a specific local LAN IP** (e.g. `192.168.1.50`) over `0.0.0.0` — the latter applies to every interface and risks being visible to a wider network.
> - Use the firewall to **allow the port only for a trusted LAN segment**; never map it to the public internet or a router DMZ.
> - After enabling LAN, also update the extension side: change the extension's `wsHost` from `127.0.0.1` to the bridge machine's LAN IP (e.g. `ws://192.168.1.50:8333`), otherwise the extension still connects to localhost and fails.

Keeping the default `127.0.0.1` remains the recommended choice — the port is then visible only within your own machine, giving the smallest security surface.

## 5. Verify the connection

1. Fully restart the AI client after saving the config.
2. In the client's MCP / tools panel you should see the `smart-bookmark` server, and bookmark-related tools in the tool list.
3. If the extension is not yet connected (it only connects after you manually enable MCP in its Settings page and fill in the IP/port), `tools/list` returns an **empty catalog** (no error); once it connects, the bridge sends `notifications/tools/list_changed` so the client refreshes automatically.

## 6. Troubleshooting

**1. `ENOENT` / `command not found` on launch**
You used the bare command `smart-bookmark-mcp`, but the bin is not installed globally or is not on the client process's PATH.
→ First make sure it is installed globally: `npm install -g @ludengke95/smart-bookmark-mcp`, with the bin on the client process's PATH (recommended — see §2 Install & Run). If you prefer not to install globally, use `"command": "npx"` + `"args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]` so npx resolves it without relying on PATH.

**2. Empty tool list**
→ Most common cause: the browser extension has MCP **disabled by default**. Go to the extension's Settings page, manually enable MCP, and fill in the same communication IP and port as the bridge (default `127.0.0.1` / `8333`; for LAN, use the bridge machine's LAN IP — see §4 LAN use). Once the extension is installed and MCP is enabled, the bridge pushes `notifications/tools/list_changed` on connect so the client refreshes the tool list.

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
