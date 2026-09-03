# 🌟 Smart Bookmark - Product Overview

> **Languages / 语言**: English | [简体中文](../产品介绍.md)

## 1. Background & Core Pain Points Solved

In modern software engineering, DevOps, and digital productivity workflows, users constantly face recurring headaches with traditional bookmark managers:

### 1. Divergent Intranet & Extranet Endpoints (The Core Problem)
Mission-critical systems (such as **GitLab, Jenkins, Grafana, Jira, private wikis, NAS servers**, etc.) frequently have fundamentally different addresses depending on the environment:
- **Inside the office / LAN**: Accessed via high-speed internal IPs (e.g. `http://192.168.10.20:8080`);
- **At home / remote travel**: Accessed via public domain names, reverse proxies (e.g. `https://git.company.com`), or specialized VPN subnets.

**The limitation of traditional bookmarks**: A conventional browser bookmark only holds one single URL. Users either create multiple duplicate bookmarks and guess which one to click, or suffer through long timeout spinners before manually changing URLs.

> **Smart Bookmark's Solution**: Introducing the **"One Bookmark Entity = Multiple Endpoints"** paradigm. The extension automatically senses the client's current network environment, executes lightweight background reachability probes, and routes you directly to the optimal endpoint in milliseconds!

### 2. Deep Nesting & "Digital Graveyards"
As bookmarks accumulate, native browser bookmark bars become overcrowded with convoluted folder hierarchies. Manual classification of hundreds of links is tedious and rarely maintained.

### 3. Privacy Concerns & Rigid Visuals
Third-party cloud bookmarking services often demand account registration and upload sensitive internal URLs to remote servers. Meanwhile, standard browser New Tab pages are cluttered with promotional feeds and rigid layouts.

---

## 2. Key Features & Technical Highlights

### 1. 🚀 Multi-Endpoint Probing with XOR Topology Matching
- **Multi-URL Association**: Each bookmark can house multiple target endpoints (Direct Intranet IP, Public Domain, Backup Gateway, etc.).
- **32-bit Binary IP XOR Algorithm**:
  - Automatically identifies client LAN IP via WebRTC;
  - Transforms IPv4 addresses into 32-bit integers, using bitwise XOR to compute the **Longest Common Prefix** and prioritize endpoints on the same subnet.
- **Failover Verification**:
  - Concurrent lightweight probes track reachability;
  - On-click fast re-verification automatically falls back to secondary viable endpoints if the primary endpoint is unresponsive.

### 2. 🧠 AI Zero-Key Multi-Tier Categorization
- **Web LLM Zero-Key Mode (100% Free)**:
  - Export bookmark metadata and optimized categorization prompts with one click;
  - Paste into any web-based LLM (ChatGPT, Claude, Kimi, DeepSeek);
  - Paste the resulting JSON back into the extension to apply a structured reorganization with zero API keys required.
- **Direct API & MCP Ecosystem**:
  - Support for OpenAI / DeepSeek / Ollama endpoints;
  - Model Context Protocol (MCP) server bridge for local AI agent integration (Cursor, Claude Desktop).

### 3. 🎨 Zero-Jitter Design System & Minimalist Themes
- **Three Precision Themes**:
  - Paper Sand (Paper Sand, warm & easy on the eyes)
  - Ceramic Light (Clean, bright, distraction-free)
  - Obsidian Dark (Deep charcoal, focused night mode)
- **Fluid Layout**:
  - Frequently Used auto-pinned group;
  - Custom groups with intuitive drag-and-drop;
  - Ungrouped safety net;
  - Multilingual support across New Tab and Settings.
