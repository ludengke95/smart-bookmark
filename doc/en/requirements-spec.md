# Smart Bookmark Application - Requirements & Specification v0.2

> **Languages / 语言**: English | [简体中文](../书签应用-需求文档.md)

## 1. Product Positioning

A modern **Chrome Extension (Manifest V3)** designed for personal and team productivity. Its core differentiator is **multi-endpoint route optimization**: a single bookmark can be linked to multiple destination URLs (Intranet IP vs. Extranet domain). Upon clicking, the extension automatically selects and launches the optimal endpoint matching the client's current network topology.

### Phased Roadmap
- **Phase 1 (MVP - Local-First)**: Standalone extension relying exclusively on local client-side persistence (`chrome.storage.local`), zero external server dependencies.
- **Phase 2 (Cloud Sync)**: Optional end-to-end encrypted synchronization server for multi-device cross-browser state sharing.

---

## 2. Core Domain Models

- **Bookmark Entity**: Represents a single logical service/application (the atomic unit of management). Attributes: Name, Icon (Preset Lucide / Custom Image), Group, Tags, and an array of Endpoints.
- **Endpoint Entity**: A concrete destination URL attached to a bookmark. Attributes: URL, Reachability State, Latency, and Network Classification (Intranet vs. Public, derived via IP matching).

> **Core Formula**: `1 Bookmark = 1 Logical Identity + N Physical Endpoints`

---

## 3. Functional Requirements Matrix

### 3.1 Bookmark Input & Management
- **Manual Entry**: Configure Name, Tags, Group, and multiple URLs. Icons are automatically fetched via favicon extraction with support for custom overrides.
- **Native Browser Import**: Direct integration with `chrome.bookmarks` API. Automatically marks potential duplicates based on URL or title similarity without destructive overwrites.

### 3.2 Intelligent Routing & Reachability Engine
- **Client IP Detection**: Probes WebRTC peer connection candidates to obtain local client LAN IPv4 addresses.
- **32-bit XOR Prefix Matching**: Calculates Hamming distance / longest common subnet prefix between client IP and destination IPs to prioritize nearest intranet routes.
- **Failover Mechanism**: If a primary intranet route times out, automatically degrades to public or backup endpoints without user interruption.

### 3.3 Internationalization (i18n)
- Seamless dual-layer i18n architecture:
  - Chrome Extension Manifest: `public/_locales` support for Web Store and Chrome Extension manager.
  - Svelte 5 Runes Reactive Engine: Instant hot-swapping between `auto`, `zh-CN`, and `en-US` with complete template parameter interpolation and fallback safeguards.

### 3.4 Data Security & Snapshots
- Local-first architecture ensuring zero telemetry transmission.
- Pre-operation automated snapshots and manual rollback capabilities.
