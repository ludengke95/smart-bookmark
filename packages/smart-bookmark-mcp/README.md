# @ludengke95/smart-bookmark-mcp

MCP (Model Context Protocol) bridge server for the **Smart Bookmark** Chrome extension.

It lets AI clients such as **Cursor**, **Claude Desktop**, and **Windsurf** read and manage your
bookmarks, groups, and tags through a standardized MCP interface. The bridge runs locally as a
zero-dependency Node.js process and relays MCP JSON-RPC calls (over stdio) to the Smart Bookmark
extension (over a local WebSocket).

> The extension itself must be installed and its new-tab page kept active. The bridge only proxies
> between your AI client and the extension — it does not store or read your bookmarks on its own.

## Install / Run

No build step, no dependencies. Either run it directly:

```bash
npx @ludengke95/smart-bookmark-mcp
```

…or install it globally and run the bin:

```bash
npm install -g @ludengke95/smart-bookmark-mcp
smart-bookmark-mcp
```

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
npx @ludengke95/smart-bookmark-mcp --host 127.0.0.1 --port 9000
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
      "args": ["@ludengke95/smart-bookmark-mcp"]
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
      "args": ["@ludengke95/smart-bookmark-mcp"]
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
      "args": ["@ludengke95/smart-bookmark-mcp", "--port", "9000"]
    }
  }
}
```

## How it works

```
[AI client] --stdio(JSON-RPC)--> [mcp-bridge.js] --WebSocket--> [Smart Bookmark extension]
```

1. The AI client starts the bridge over stdio and speaks MCP JSON-RPC.
2. The bridge opens an RFC 6455 WebSocket server (hand-rolled, no deps) on `127.0.0.1:8333`.
3. The Smart Bookmark extension connects to that WebSocket and registers its MCP tools.
4. `tools/list` and `tools/call` from the AI client are forwarded to the extension, whose
   responses are written back to stdout.

### Extension not connected yet?

- `tools/list` returns an empty catalog (`{ "tools": [] }`) instead of an error, so the AI client
  keeps the stdio connection alive while the browser is still starting.
- When the extension connects or disconnects, the bridge sends `notifications/tools/list_changed`
  so the client can refetch `tools/list` automatically.
- `tools/call` still requires the extension to be connected and returns a `-32000` error if it is not.

The actual tool definitions and bookmark operations live in the extension; the bridge is a thin,
transport-only proxy so it stays compatible with the extension's protocol version.

## 🚧 Planned improvements

Per-client routing and authentication are **not implemented yet**. The bridge currently
broadcasts every `tools/call` to **all** connected extensions and performs no client identity or
auth check (the WebSocket SHA-1 handshake is protocol compliance only, not a security boundary).
See the project roadmap for the proposed fix and current status:
[Roadmap (English)](../../ROADMAP_EN.md) | [Roadmap (中文)](../../ROADMAP.md).

## Requirements

- Node.js >= 18
- The Smart Bookmark extension installed, with its new-tab page open.

## License

MIT © ludengke95
