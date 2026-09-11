# @ludengke95/smart-bookmark-mcp

> **Languages**: English | [简体中文](./README.md)

Official MCP (Model Context Protocol) bridge server for the **Smart Bookmark** browser extension (Chrome / Edge).

It allows AI clients such as **Cursor**, **Claude Desktop**, **Windsurf**, **VS Code**, **CherryStudio**, **Dify**, and **WorkBuddy** to securely query and manage your bookmarks, groups, and tags through a standardized MCP interface.

## 🌟 Highlights

- **Native Messaging Integration**: The extension invokes the local Node.js host directly from its Background Service Worker via `chrome.runtime.connectNative`. **No need to keep a new-tab page open**.
- **Streamable HTTP & SSE**: Provides standard `http://127.0.0.1:8333/mcp` and `/sse` endpoints, natively supported by modern Web/desktop AI clients like CherryStudio and Dify.
- **Stdio Transparent Proxy**: The `smart-bookmark-mcp stdio` subcommand relays stdio commands to the local HTTP endpoint for editors like Cursor and Claude Desktop.
- **Cross-Platform One-Click Registration**: Automatically configures the Native Messaging manifest on Windows (HKCU registry), macOS, and Linux for both Chrome and Edge.

> 📘 Full setup guide (Chinese): [../../doc/MCP配置使用手册.md](../../doc/MCP配置使用手册.md) | (English): [../../doc/en/mcp-config-guide.md](../../doc/en/mcp-config-guide.md)

---

## 🚀 Quick Start (3 Steps)

### Step 1: Register Native Messaging Host

Run the following command in your terminal:

```bash
npx -y @ludengke95/smart-bookmark-mcp register
```

> You can also run `npx -y @ludengke95/smart-bookmark-mcp install` for the interactive client setup wizard.

### Step 2: Enable MCP in Browser Extension

1. Open Smart Bookmark settings → **MCP Bridge**.
2. Turn on the **Enable MCP Server** toggle (default port is `8333`; status turns to green `Native Active`).

### Step 3: Configure Your AI Client

#### 1. Code Editors (Cursor / Claude Desktop / Windsurf)

Add the following to your `mcp.json` or `claude_desktop_config.json`:

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

#### 2. Web / Desktop Clients (CherryStudio / Dify)

Add a **Streamable HTTP** endpoint:
- **URL**: `http://127.0.0.1:8333/mcp`
- **Type**: Streamable HTTP / SSE

---

## 🛠️ CLI Commands

```bash
# Register Native Messaging Host with Chrome and Edge
smart-bookmark-mcp register

# Unregister Native Messaging Host
smart-bookmark-mcp unregister

# Launch Stdio mode proxy (for Cursor / Claude Desktop)
smart-bookmark-mcp stdio

# Interactive setup wizard for AI clients
smart-bookmark-mcp install

# Native Messaging Host mode (spawned automatically by Chrome/Edge)
smart-bookmark-mcp native
```

### Stdio Proxy Options

| Flag / Env | Default | Description |
| --- | --- | --- |
| `--host <host>` | `127.0.0.1` | Target HTTP server host |
| `--port <port>` | `8333` | Target HTTP server port |
| `SMART_BOOKMARK_MCP_HOST` | `127.0.0.1` | Target host via environment variable |
| `SMART_BOOKMARK_MCP_PORT` | `8333` | Target port via environment variable |

---

## 🧩 Architecture

```
[AI Client (Cursor / Claude)]        [AI Client (CherryStudio / Dify)]
        │ stdio                                      │ Streamable HTTP (/mcp)
        ▼                                            ▼
[smart-bookmark-mcp stdio] ───────────► [Native Host HTTP Server (:8333)]
                                                     │ 4-byte LE framing
                                                     ▼
                                      [Chrome / Edge Native Host]
                                                     │ chrome.runtime.connectNative
                                                     ▼
                                      [Smart Bookmark Service Worker]
                                                     │ Dexie.js (IndexedDB)
                                      [Local Bookmarks / Groups / Tags DB]
```

---

## 📦 Supported MCP Tools (17 Tools)

| Tool Name | Type | Description |
|---|---|---|
| `list_bookmarks` | Query | Query bookmarks with filtering by keyword, group ID, or tag, with `limit` and `offset` pagination. |
| `get_groups` | Query | List all custom and built-in bookmark groups with bookmark counts. |
| `get_tags` | Query | List all used tags with usage frequency. |
| `create_bookmark` | Mutation | Create a new bookmark with title, group, tags, and multi-entry topology. |
| `update_bookmark` | Mutation | Update bookmark title, URL, endpoints, group, or tags. |
| `delete_bookmark` | Mutation | Delete a bookmark by ID. |
| `batch_delete_bookmarks` | Mutation | Batch delete bookmarks by IDs. |
| `create_group` | Mutation | Create a new custom group. |
| `update_group` | Mutation | Rename or update an existing group. |
| `delete_group` | Mutation | Delete a group and demote contained bookmarks to Ungrouped. |
| `rename_tag` | Mutation | Rename or merge tags across all bookmarks with auto-deduplication. |
| `delete_tag` | Mutation | Delete a tag globally from all bookmarks. |
| `batch_organize_bookmarks` | Mutation | Batch organize bookmarks (groups and tags) with snapshot safety. |
| `list_snapshots` | Recovery | List historical backup snapshots. |
| `rollback_snapshot` | Recovery | Rollback bookmarks and groups to a snapshot. |
| `get_network_topology` | System | Retrieve detected network interfaces, local IPs, and probe cache. |
| `export_full_data` | Backup | Export complete backup JSON data. |

---

## ❓ FAQ & Troubleshooting

1. **`smart-bookmark-mcp register` succeeded, but extension shows "Unregistered"?**
   - Please restart Chrome / Edge completely to load the newly written Native Messaging host manifest.
2. **AI client reports unable to connect to `http://127.0.0.1:8333/mcp`?**
   - Ensure Chrome / Edge is running and "Enable MCP Server" is turned on in extension settings.
3. **LAN access:**
   - Turn on "Allow LAN Access" in extension advanced settings to bind to `0.0.0.0:8333`.

---

## 📄 License

MIT License © ludengke95
