# @ludengke95/smart-bookmark-mcp

MCP (Model Context Protocol) bridge server for the **Smart Bookmark** Chrome extension.

It lets AI clients such as **Cursor**, **Claude Desktop**, and **Windsurf** read and manage your
bookmarks, groups, and tags through a standardized MCP interface. The bridge runs locally as a
Node.js process and relays MCP JSON-RPC calls (over stdio) to the Smart Bookmark
extension (over a local WebSocket). It is built on the official
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) and the
mature [`ws`](https://www.npmjs.com/package/ws) WebSocket library — no hand-rolled protocol code.

> The extension itself must be installed and its new-tab page kept active. The bridge only proxies
> between your AI client and the extension — it does not store or read your bookmarks on its own.

> 📘 中文配置手册（Chinese config guide）：[../../doc/MCP配置使用手册.md](../../doc/MCP配置使用手册.md)

## Install / Run

No build step (the published package is plain ESM + a bin). It pulls two runtime dependencies
(`@modelcontextprotocol/sdk` and `ws`) on install. Two ways to install and run — **global install
is recommended** (the bin lands on your PATH, so client configs can use the bare command and startup
is faster):

### Method 1 (recommended): global install

```bash
npm install -g @ludengke95/smart-bookmark-mcp
smart-bookmark-mcp server
```

### Method 2 (manual): npx on demand

```bash
npx -y @ludengke95/smart-bookmark-mcp server
```

(No install needed, but it fetches the published package from npm on every launch — requires network.)

> `smart-bookmark-mcp` is a subcommand CLI: `server` starts the bridge (also the default when run bare), and `install` launches the interactive setup wizard that writes client configs for you (choose language / client / scope / LAN).

### Interactive setup wizard

Instead of editing each client's config by hand, run the wizard — it prompts for
**language → clients (multi-select) → scope → LAN**, writes the config into each
selected file, and prints a universal JSON:

```bash
smart-bookmark-mcp install
```

Non-interactive / CI form:

```bash
smart-bookmark-mcp install --target claude,workbuddy --location global --yes
smart-bookmark-mcp install --target all --location global --lan --yes   # enable LAN (0.0.0.0)
smart-bookmark-mcp install --help
```

Flags: `--target <ids>` (`all`/`auto`/`none` or comma-separated ids/indices),
`--location global|project`, `--lan`/`--no-lan`, `--yes`, `--help`.
The wizard writes `command: "npx"` snippets; if installed globally you can switch
`command` to `smart-bookmark-mcp`.

### Options

| Flag / Env        | Default        | Description                          |
| ----------------- | -------------- | ------------------------------------ |
| `--host <host>`   | `127.0.0.1`    | WebSocket bind host                 |
| `--host=<host>`   | `127.0.0.1`    | (equals form)                       |
| `--port <port>`   | `8333`         | WebSocket bind port                 |
| `--port=<port>`   | `8333`         | (equals form)                       |
| `HOST` (env)      | `127.0.0.1`    | WebSocket bind host                 |
| `PORT` (env)      | `8333`         | WebSocket bind port                 |

Example:

```bash
smart-bookmark-mcp server --host 127.0.0.1 --port 9000
```

A plain HTTP `GET` on the WebSocket port returns a small status JSON
(`{ "name": "smart-bookmark-mcp-bridge", "status": "running", ... }`).

## Connect an AI client

Add the bridge to your MCP client config. The client launches it over stdio.

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

### Cursor (`.cursor/mcp.json` or Settings → MCP)

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

### Custom host / port

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

## How it works

```
[AI client] --stdio(JSON-RPC)--> [mcp-bridge.js] --WebSocket--> [Smart Bookmark extension]
```

1. The AI client starts the bridge over stdio; the bridge speaks MCP JSON-RPC to the client using
   the official `@modelcontextprotocol/sdk` `Server`.
2. The bridge opens an RFC 6455 WebSocket server (via the `ws` library) on `127.0.0.1:8333`.
3. The Smart Bookmark extension connects to that WebSocket and runs an MCP server over it; the
   bridge connects as an MCP `Client` (one per extension connection, via a custom transport).
4. `tools/list` and `tools/call` from the AI client are proxied to the extension's MCP server, and
   the responses are written back to stdout.

### Extension not connected yet?

- `tools/list` returns an empty catalog (`{ "tools": [] }`) instead of an error, so the AI client
  keeps the stdio connection alive while the browser is still starting.
- When the extension connects or disconnects, the bridge sends `notifications/tools/list_changed`
  so the client can refetch `tools/list` automatically.
- `tools/call` still requires the extension to be connected and returns a `-32000` error if it is not.

The actual tool definitions and bookmark operations live in the extension; the bridge is a thin,
transport-only proxy so it stays compatible with the extension's protocol version.

## Available Tools

The extension declares the following 13 MCP tools to connected AI models:

| Tool | Type | Description |
|---|---|---|
| `list_bookmarks` | Query | List bookmarks with keyword search (name/tag/URL), group filter, tag filter, and pagination (`limit`, `offset`). |
| `get_groups` | Query | List all custom and built-in groups with bookmark count per group and assignability flags. |
| `get_tags` | Query | List all tags with usage frequency and click counts, sorted by popularity. |
| `create_bookmark` | Mutation | Create a bookmark with primary URL, group, tags, and multi-endpoint routing (intranet/extranet/direct). Returns generated `id`. |
| `update_bookmark` | Mutation | Update bookmark title, primary URL, multi-endpoints, group, and tags (`replace`, `append`, or `remove`). |
| `delete_bookmark` | Mutation | Delete a single bookmark by ID. Returns deleted bookmark info. |
| `batch_delete_bookmarks` | Mutation | Delete multiple bookmarks in bulk by array of IDs. |
| `create_group` | Mutation | Create a custom bookmark group. Returns newly created group with ID. |
| `batch_organize_bookmarks` | Mutation | Batch migrate groups and append/replace tags. Automatically creates a safety snapshot before execution. |
| `list_snapshots` | Recovery | List available safety backup snapshots with metadata (ID, time, reason, counts) for recovery. |
| `rollback_snapshot` | Recovery | Roll back all bookmarks, groups, and settings to a selected safety snapshot. |
| `get_network_topology` | System | Get detected LAN IPs, local network interfaces, and cached latency history. |
| `export_full_data` | Backup | Export complete JSON backup of all bookmarks, groups, and settings. |

## Verify the connection

1. Fully restart the AI client after saving the config.
2. In the client's MCP / tools panel you should see the `smart-bookmark` server, with bookmark-related tools listed.
3. If the extension is not yet connected, `tools/list` returns an empty catalog (no error); once it connects, the bridge sends `notifications/tools/list_changed` so the client refreshes automatically.

## Troubleshooting

- **`ENOENT` / `command not found` on launch** — you used the bare command `smart-bookmark-mcp`, but the bin is not installed globally or is not on the client process's PATH. Install it globally first: `npm install -g @ludengke95/smart-bookmark-mcp` (recommended — see above). If you prefer not to install globally, use `"command": "npx"` + `"args": ["-y", "@ludengke95/smart-bookmark-mcp", "server"]` so npx resolves it without relying on PATH.
- **Empty tool list** — confirm the extension is installed and its new-tab page is open.
- **Port conflict / launch failure** — pick another port: `--port 9000`, or set the `PORT` env var.
- **Node version too old** — the bridge requires Node.js >= 20.12 (the interactive wizard uses `@clack/prompts`); verify with `node -v`.

## Security

- The bridge only listens on `127.0.0.1` locally — **do not expose the port to the public internet**.
- The current version performs **no client authentication** (per-client auth/routing is planned). The WebSocket handshake is protocol compliance only, not a security boundary.

## 🚧 Planned improvements

Per-client routing and authentication are **not implemented yet**. The bridge currently
broadcasts every `tools/call` to **all** connected extensions and performs no client identity or
auth check (the WebSocket SHA-1 handshake is protocol compliance only, not a security boundary).
See the project roadmap for the proposed fix and current status:
[Roadmap (English)](../../ROADMAP_EN.md) | [Roadmap (中文)](../../ROADMAP.md).

## Requirements

- Node.js >= 20.12
- The Smart Bookmark extension installed, with its new-tab page open.

## License

MIT © ludengke95
