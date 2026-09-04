# 🌟 Smart Bookmark - Intelligent Route Selector & New Tab Extension

> **Languages**: English | [简体中文](./README.md)
>
> **An intelligent bookmark and New Tab Chrome extension (Manifest V3) crafted for software engineers and technical teams.**
> Solving the persistent frustration of services having divergent intranet and extranet endpoints requiring tedious manual mental mapping. Featuring client-side network topology probing with a 32-bit binary XOR longest-prefix matching routing engine, key-free Web LLM prompt AI categorization, multidimensional sorting, and three zero-glare minimalist themes.

[![WXT](https://img.shields.io/badge/Extension-WXT_0.21-6C5CE7?style=flat-square)](https://wxt.dev)
[![Svelte 5](https://img.shields.io/badge/Framework-Svelte_5_(Runes)-FF3E00?style=flat-square)](https://svelte.dev)
[![Tailwind CSS](https://img.shields.io/badge/CSS-Tailwind_3.4-38B2AC?style=flat-square)](https://tailwindcss.com)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

---

## 🚀 Key Highlights

### 1. ⚡ One Bookmark, Multiple Endpoints
- Associate each bookmark with multiple URLs (Direct Intranet IP, Corporate VPN node, Public reverse proxy domain, Backup mirror, etc.).
- Eliminate messy duplicate bookmarks for the exact same service once and for all.

### 2. 🧠 32-bit Binary IP XOR Topology Route Optimization
- **Intranet Environment Auto-Detection**: Leverages WebRTC local probing to sense client LAN subnet variations within seconds.
- **Longest Common Prefix Matching**: Converts IPv4 addresses to 32-bit integers, calculating subnet proximity depth via bitwise XOR to prioritize same-subnet or closest gateway endpoints.
- **Concurrent Lightweight Probes & Instant Failover**: Periodically verifies reachability with low-overhead probes; re-checks optimal endpoint upon user click, falling back to viable alternative endpoints in milliseconds if the primary route times out.

### 3. ✨ Multimodal AI Bookmark Organization & Categorization
- **Web LLM Zero-Key Mode (100% Free)**: Package all bookmark structures into a standardized JSON prompt with a single click. Copy to ChatGPT, Claude, Kimi, or DeepSeek, then paste the structured JSON response or import the file to apply a complete reorganization.
- **API Direct Connect Mode**: Configure OpenAI, DeepSeek, or local Ollama endpoints for one-click automated classification.
- **MCP (Model Context Protocol) Support**: Interoperable with local AI agents (Cursor, Claude Desktop) as a standard tool server.

### 4. 📊 5 Dynamic Bookmark Sorting Criteria
- **↕ Custom Sort (Default)**: Intuitive drag-and-drop reordering and cross-group migration directly on the canvas.
- **🔥 By Frequency**: Automatically ranked by historical click counts.
- **🔤 By Name**: Alphabetical / Lexicographical (A-Z) ordering.
- **⚡ By Latency**: Prioritizes reachable bookmarks with ultra-low ping response.
- **🕒 By Added Date**: Chronological reverse order (newest first).

### 5. 🎨 Minimalist Aesthetic & Zero-Jitter Design System
- **Three Refined Minimalist Themes**:
  - **Paper Sand (`paper-sand`)**: Muted warm ink tone, gentle on tired eyes;
  - **Ceramic Light (`ceramic-light`)**: Smooth bone china white, clean and crisp;
  - **Obsidian Dark (`obsidian-dark`)**: Deep charcoal graphite, focused night mode.
- **Three-Tier Category Structure**:
  - **"Frequently Used"**: Auto-calculated based on access telemetry;
  - **"Custom Groups"**: Create, sort, rename, and collapse with ease;
  - **"Ungrouped"**: Fallback container ensuring zero orphaned bookmarks.
- **Omni Search Bar**: Instant local bookmark filtering combined with single-keystroke jump to Google, Bing, Baidu, or GitHub search.
- **Multilingual Support (i18n)**: Instant hot-switching between System Default (Auto), 简体中文 (zh-CN), and English (en-US).

### 6. 🔒 100% Local-First Architecture & Safety Snapshots
- All data resides strictly on the local machine (`chrome.storage.local`). No account required, zero remote telemetry, zero cloud lock-in.
- Pre-operation automated snapshots, periodic backups, and one-click rollback.
- Complete support for native browser bookmark importing (with smart duplicate indicators) and full JSON backup/restore.

---

## 🛠️ Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation & Development

```bash
# 1. Clone the repository
git clone https://github.com/ludengke95/smart-bookmark.git
cd smart-bookmark

# 2. Install dependencies
npm install

# 3. Start development mode (with Vite + WXT HMR)
npm run dev
```

### Loading in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the upper right corner.
3. Click **Load unpacked** and select the `.output/chrome-mv3` folder.
4. Open a new tab or click the extension icon to start navigating.

### Production Build & Packaging

```bash
# Build production bundle
npm run build

# Package into a zip archive ready for Web Store distribution
npm run zip
```

---

## 📂 Project Structure

> Layered as "pure service layer → global reactive store → UI components". Large files are split by concern while keeping their public APIs compatible; all UI copy and LLM prompts are centralized in the `i18n` language packs.

```
src/
├── app.css                  # Tailwind CSS & 3 minimalist theme tokens
├── constants/               # Defaults: engines, themes, AI/MCP/backup policy
├── services/                # Pure business logic
│   ├── errors.js            # serviceError() structured error codes
│   ├── bookmark-sort.js     # Sorting comparator pure functions
│   ├── xor-matcher.js       # 32-bit XOR longest-prefix routing engine
│   ├── ip-detector.js       # WebRTC LAN IP sniffing
│   ├── ping-probe.js        # Concurrent reachability probe & latency
│   ├── favicon-fetcher.js / icons-library.js
│   ├── storage/             # Storage layer by domain (base/bookmark/group/
│   │                        #   stats/backup/ai + barrel), storage.js = compat entry
│   ├── ai/                  # organizer.js (pipelines) / prompt-builder.js /
│   │                        #   custom-engine.js (OpenAI-compatible driver)
│   └── mcp/client.js        # MCP protocol client
├── state/                   # Svelte 5 global stores (app.svelte.js, toast.svelte.js)
├── i18n/                    # Runes-driven i18n engine (t + utils)
│   └── locales/             # zh-CN | en-US × {common, modals, newtab, ai-prompt}
├── components/
│   ├── common/              # ModalShell / ConfirmModal / ToggleRow / SelectRow /
│   │                        #   ActionButton / EmptyState / Select / Toast / IconRender
│   ├── newtab/              # TopNav, HeroSearch, BookmarkGrid, TagPills, BookmarkCard...
│   └── modals/              # All dialogs on ModalShell; settings/ holds per-tab components
└── entrypoints/             # background.js (SW) / home (new tab) / popup
```

---

## 📚 Documentation

- [Product Overview (English)](./doc/en/product-overview.md) | [产品介绍 (中文)](./doc/产品介绍.md)
- [User Manual (English)](./doc/en/user-manual.md) | [用户使用手册 (中文)](./doc/用户使用手册.md)
- [Requirements & Specifications (English)](./doc/en/requirements-spec.md) | [需求文档 (中文)](./doc/书签应用-需求文档.md)
- [Frontend Design Specification (English)](./doc/en/frontend-design-spec.md) | [前端设计规范 (中文)](./doc/前端设计规范.md)
- 🗺️ [Roadmap: Planned & In-Progress Features (English)](./ROADMAP_EN.md) | [Roadmap 中文](./ROADMAP.md)

---

## 📄 License

Licensed under the [MIT License](LICENSE).
