Languages / 语言: [中文](../MCP配置使用手册.md)

# Smart Bookmark MCP — Configuration Guide

The MCP (Model Context Protocol) service exposes your **Smart Bookmark** browser extension's bookmarks, groups, tags, and network topology to various AI clients (Cursor, Claude Desktop, Windsurf, VS Code, CherryStudio, Dify, NextChat, FastGPT, etc.) through standard MCP interfaces.

---

## 🌟 Key Architecture & Highlights

1. **Native Messaging Deep Integration**: The browser extension launches the local Node host silently in the background via `chrome.runtime.connectNative`. **No need to keep a new-tab page open in your browser**.
2. **Multi-Protocol Native Support**:
   - **Streamable HTTP / SSE**: Listens at `http://127.0.0.1:8333/mcp` and `/sse`, tailor-made for Web UIs or desktop clients (CherryStudio, Dify, etc.).
   - **Stdio Transparent Proxy**: Provides the `smart-bookmark-mcp stdio` command, ready for code editors (Cursor, Claude Desktop, etc.).
3. **Cross-Platform Automatic Registration**: One command writes manifests to Windows HKCU Registry, macOS, and Linux for both Chrome and Edge.

---

## 1. Prerequisites

- **Node.js ≥ 20.12** (verify with `node -v`)
- **Smart Bookmark** extension installed in Chrome or Edge

---

## 2. Quick Setup (Recommended 3 Steps)

### Step 1: Register Native Messaging Host

Run the registration command once in your terminal:

```bash
npx -y @ludengke95/smart-bookmark-mcp register
```

> **Note**: After initial registration, please **completely restart Chrome or Edge** to load the new host manifest.

---

### Step 2: Enable MCP in Extension Settings

1. Open the Smart Bookmark new-tab page or popup.
2. Go to **Settings** → **MCP Bridge** tab.
3. Turn on the **Enable MCP Server** toggle (the status indicator pulses green: `Native Active`).
4. (Optional) Adjust the port (default `8333`) or enable "Allow LAN Access" under Advanced Settings.

---

### Step 3: Configure Your AI Client

#### Option A: Code Editors (Cursor / Claude Desktop / Windsurf)

Connect via **Stdio mode** by adding the following snippet into your client's config file:

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

**Common Editor Config Paths:**
- **Cursor**: `<project>/.cursor/mcp.json` or global `~/.cursor/mcp.json`
- **Claude Desktop**:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- **VS Code (Copilot / MCP)**: `<project>/.vscode/mcp.json`
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
- **Windsurf**: `~/.codeium/windsurf/mcp_config.json`
- **WorkBuddy**: `~/.workbuddy/mcp.json` (Go to Connector Management → Custom Connector and click Trust)

---

#### Option B: Desktop / Web AI Clients (CherryStudio / Dify / FastGPT)

Connect via **Streamable HTTP mode**:

- **Endpoint URL**: `http://127.0.0.1:8333/mcp`
- **Transport**: `Streamable HTTP` or `SSE`
- **JSON Format (where applicable)**:
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

## 3. Interactive Setup Wizard (Optional)

Prefer not to edit config files by hand? Run the interactive wizard to automatically select clients and write configurations:

```bash
npx -y @ludengke95/smart-bookmark-mcp install
```

Non-interactive / CI usage:

```bash
# Auto-write global configs for Claude Desktop and WorkBuddy
npx -y @ludengke95/smart-bookmark-mcp install --target claude,workbuddy --location global --yes

# Show all supported flags
npx -y @ludengke95/smart-bookmark-mcp install --help
```

---

## 4. Advanced Settings & LAN Access

### Custom Port

If port `8333` is occupied, change it in extension Settings → MCP Bridge → Advanced Settings (e.g. to `9000`):
- For Streamable HTTP clients, change URL to `http://127.0.0.1:9000/mcp`.
- For Stdio clients, append `"--port", "9000"` to `args`.

### LAN Access

By default, the HTTP server binds only to loopback `127.0.0.1`. To allow other devices on your local network to connect:

1. In extension MCP Advanced Settings, toggle **Allow LAN Access** on (the server binds to `0.0.0.0:8333`).
2. On other devices, replace `127.0.0.1` with this machine's LAN IP (e.g. `http://192.168.1.50:8333/mcp`).

> ⚠️ **Security Warning**: LAN access allows any device on your local subnet to read and update your bookmarks. Use only on trusted networks; never expose the port to the public Internet.

---

## 5. Health Check & Verification

1. **Ping Endpoint**: Open `http://127.0.0.1:8333/ping` in your browser. It returns:
   ```json
   {
     "status": "ok",
     "uptime": 12.34,
     "version": "1.0.3",
     "service": "smart-bookmark-mcp"
   }
   ```
2. **Tool Catalog**: Restart your AI client. In its tools panel, you will see 17 available bookmark management tools (`list_bookmarks`, `create_bookmark`, `batch_organize_bookmarks`, etc.).

---

## 6. FAQ & Troubleshooting

**1. Client cannot connect or tool list is empty?**
- Verify that **Enable MCP Server** is switched on in extension settings.
- Ensure Chrome or Edge is running (the native host exits when the browser closes).
- Restart your browser completely after the initial `register` command.

**2. `command not found: smart-bookmark-mcp`?**
- Use `npx -y @ludengke95/smart-bookmark-mcp ...` or install globally via `npm install -g @ludengke95/smart-bookmark-mcp`.

**3. How to unregister?**
- Run `npx -y @ludengke95/smart-bookmark-mcp unregister` to remove the host manifests cleanly.
