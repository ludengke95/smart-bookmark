# 🔒 Smart Bookmark Privacy Policy

**Effective Date**: September 14, 2026  
**Last Updated**: September 14, 2026  
**Languages**: [简体中文](./PRIVACY.md) | English

---

## Overview and Core Principles

Thank you for choosing **Smart Bookmark** (Intelligent Route Selector & New Tab Extension). We firmly believe that your bookmarks, browsing habits, and local network topology are sensitive and private assets. Therefore, from its inception, Smart Bookmark has been engineered around the **Local-First** architectural paradigm.

**Our Core Commitments:**
- **Zero Centralized Servers**: We do not own, maintain, or deploy any remote servers to collect, store, or sync your data.
- **Zero Personally Identifiable Information (PII) Collection**: We require no accounts, registrations, or logins. We collect zero names, email addresses, phone numbers, or hardware device fingerprints.
- **Zero User Tracking**: The extension contains no third-party tracking scripts, analytics SDKs (e.g., Google Analytics), or behavioral telemetry.
- **Never Sold or Transferred**: Your data remains 100% in your custody and will never be monetized, sold, or shared with data brokers.

---

## 1. Data We Process and How It Is Stored

### 1.1 Bookmarks, Groups, and Tags Data
- **What We Process**: Titles, endpoint URLs (intranet/extranet addresses), custom folders/groups, tags, and website favicons explicitly created, imported, or managed by you.
- **Storage**: **100% stored locally in your browser's IndexedDB database (via the Dexie.js engine)**. This data never leaves your device unless you explicitly export a backup or invoke a third-party AI service.

### 1.2 Access Frequency and Click Telemetry
- **What We Process**: Cumulative local click counters, timestamps of the last access, and 7-day visit metrics for each bookmark.
- **Purpose**: Strictly utilized to compute the local "Frequently Used" dynamic group and power the "By Frequency" sorting comparator.
- **Storage**: Persisted solely in local IndexedDB. You can clear this telemetry at any time via the "Statistics" dashboard.

### 1.3 Local Network Topology (WebRTC LAN IP Probing)
- **What We Process**: The extension utilizes standard WebRTC APIs (`RTCPeerConnection`) to detect local private IPv4 addresses (e.g., `192.168.x.x`, `10.x.x.x`) directly within the browser runtime.
- **Purpose**: Serves as the input parameter for our **32-bit binary XOR longest common prefix matching algorithm**. This allows the extension to infer your current subnet and automatically select the closest, lowest-latency internal endpoint in milliseconds.
- **Privacy Safeguard**: **This probing occurs strictly in local transient memory. The IP is never transmitted to any external server and is never utilized to construct user fingerprinting profiles.**

### 1.4 Reachability Probes and Latency Benchmarks
- **What We Process**: Concurrent lightweight network requests (HEAD/GET) sent to endpoints configured in your bookmarks to record HTTP status codes and round-trip latency (ms).
- **Purpose**: Enables real-time failover to secondary endpoints if the primary service is unreachable, and powers the "By Latency" sorting option.
- **Storage**: Retained solely in temporary in-memory caches with a strict Time-To-Live (TTL) and discarded automatically.

### 1.5 AI Model API Keys (Credential Protection)
- **What We Process**: Third-party LLM API keys entered in "Settings → AI Models".
- **Encryption Safeguard**: **Physically isolated from general settings and encrypted at rest using browser-native Web Crypto APIs (AES-GCM-256 + PBKDF2 derived keys)** in a dedicated credentials vault.
- **Operational Scope**: Keys are decrypted strictly on demand at the exact moment an HTTP request is assembled, never reside as plaintext in reactive state trees, and are always masked in the UI (e.g., `sk-••••••••5678`). They are never transmitted to any intermediate server or proxy.

---

## 2. Browser Permissions Disclosure

To deliver its core capabilities, Smart Bookmark requests the following permissions in `manifest.json`. Every permission is scoped to the minimum necessary functionality:

| Permission | Scope | Purpose & Actual Usage | Privacy Boundary |
| :--- | :--- | :--- | :--- |
| `storage` / `unlimitedStorage` | Mandatory | Preserves UI preferences and ensures IndexedDB has sufficient quota to store bookmarks, vector icon assets, and disaster-recovery snapshots. | Restricted to local storage; never transmitted externally. |
| `bookmarks` | Optional | Requested on-demand only when you click "Import Browser Bookmarks" to migrate existing bookmarks. | Read-only access executed once in local memory upon user consent; never sent externally or altered. |
| `<all_urls>` (host_permissions) | Mandatory | ① Executes lightweight latency and reachability probes;<br>② Fetches target website favicons;<br>③ Relays user-configured AI requests (OpenAI/DeepSeek). | **Never reads, injects, modifies, or intercepts website content, DOM structures, form submissions, or cookies.** Only lightweight status checks are performed. |
| `nativeMessaging` | Mandatory | Enables IPC communication with the local MCP (Model Context Protocol) host process running on your machine for AI IDE integration (e.g., Cursor, Claude Desktop). | Confined strictly to local inter-process communication on your machine. |
| `activeTab` | Mandatory | When clicking the extension's toolbar icon, captures the active tab's URL and title to facilitate one-click bookmarking. | Triggered strictly by user interaction on the active tab; no background tab monitoring. |
| `alarms` | Mandatory | Triggers periodic background maintenance tasks (e.g., purging stale latency caches and pruning automated snapshot quotas). | Purely internal timer scheduling; involves zero network communication. |
| `offscreen` | Mandatory (Chromium) | Spawns an isolated background document context to handle DOM icon processing and offline computations unavailable in Service Workers. | Operates in an isolated sandbox context with zero external leakage. |

---

## 3. Third-Party Services and External Interactions

Smart Bookmark does not incorporate any third-party advertising or tracking SDKs. External communications occur exclusively under user-initiated workflows:

### 3.1 AI Bookmark Organization (Optional & User-Initiated)
- **Web LLM Zero-Key Mode (Default & Recommended)**:  
  The extension formats selected bookmarks into a structured prompt in local memory. **You manually copy the prompt and paste it into web-based LLMs of your choice (e.g., ChatGPT, Claude, DeepSeek, Kimi)**. Data transmission is completely transparent and under your manual control.
- **Direct API Mode**:  
  Only when you **explicitly configure** a third-party API Key in "Settings → AI Models" and initiate classification, the extension sends bookmark titles, URLs, and category structures to that API endpoint. Data handling is governed by that provider's privacy policy. **Your API Key is encrypted at rest using Web Crypto AES-GCM and stored in an isolated vault, never transmitted to any intermediate server**.
- **Local Ollama Mode**:  
  Requests are routed exclusively to your local machine (e.g., `http://localhost:11434`), operating **100% offline with zero external network transmission**.

### 3.2 Search Engine Queries
Submitting a search query in the New Tab search bar directs your browser to the designated search provider (Google, Bing, Baidu, GitHub). This interaction is identical to typing a query into your browser's address bar and is governed by that provider's respective privacy policy.

### 3.3 Website Favicons
The extension prioritizes its offline vector icon library (Simple Icons, 3,000+ brands). If no match is found, it attempts to fetch the target site's `favicon.ico`. Retrieved icons are cached locally in IndexedDB as Blobs/Base64 to eliminate redundant requests.

---

## 4. User Rights and Data Retention

You retain full, unconditional ownership of all your data:

1. **Export & Portability**: You may export all bookmarks, groups, tags, and configurations as a standardized JSON file at any time via "Snapshots & Backup". **To eliminate credential leakage, exported backups and automated disaster-recovery snapshots strictly omit API keys by default (enforced sanitization)**. Credentials are only included if you explicitly opt-in and confirm the security warning.
2. **Rollback**: The extension automatically creates local safety snapshots before major batch operations, allowing instant one-click rollback.
3. **Complete Deletion**:
   - You can permanently purge all data tables in local IndexedDB via "Settings → Danger Zone → Reset Data".
   - Uninstalling the extension via `chrome://extensions` immediately prompts the browser to purge all local storage assets associated with this extension.

---

## 5. Children's Privacy

Smart Bookmark is a productivity tool designed for software developers, IT administrators, and power users. It is not directed at children under the age of 13, nor do we knowingly solicit or collect information from children.

---

## 6. Updates to This Policy

We may update this Privacy Policy periodically to reflect changes in extension features, browser platform standards, or legal requirements. Material updates will be documented in our GitHub Release Notes alongside a revised "Last Updated" timestamp.

---

## 7. Contact Us & Open-Source Verification

Smart Bookmark is fully open-source. Its source code is publicly auditable on GitHub. If you have any inquiries, feedback, or security audit reports regarding this Privacy Policy, please reach out via:

- **Source Repository**: [https://github.com/ludengke95/smart-bookmark](https://github.com/ludengke95/smart-bookmark)
- **Issue Tracker**: [GitHub Issues](https://github.com/ludengke95/smart-bookmark/issues)
- **Developer Email**: ludengke95@gmail.com
