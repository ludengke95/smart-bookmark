# 📖 Smart Bookmark - User Manual

> **Languages / 语言**: English | [简体中文](../用户使用手册.md)

Welcome to **Smart Bookmark (Intelligent Route Selector & New Tab Extension)**! This manual provides a comprehensive guide to mastering all core features.

---

## Table of Contents
1. [Quick Installation & Initial Setup](#1-quick-installation--initial-setup)
2. [Daily Usage: New Tab Page & Quick Access](#2-daily-usage-new-tab-page--quick-access)
3. [Multidimensional Sorting](#3-multidimensional-sorting)
4. [Core Feature: Multi-Endpoint Routing Setup](#4-core-feature-multi-endpoint-routing-setup)
5. [Group & Tag Management](#5-group--tag-management)
6. [Import & Deduplication](#6-import--deduplication)
7. [AI Auto-Organization](#7-ai-auto-organization)
8. [Data Backup & Snapshots](#8-data-backup--snapshots)
9. [Preferences & Localization](#9-preferences--localization)
10. [FAQ & Troubleshooting](#10-faq--troubleshooting)

---

## 1. Quick Installation & Initial Setup

1. **Load Extension**: Load the unpacked build in Chrome or Edge extensions management (`chrome://extensions`).
2. **Set as New Tab**: Open a new tab (`Ctrl + T` / `Cmd + T`) to launch the clean Smart Bookmark dashboard.
3. **Pin to Toolbar**: Pin **Smart Bookmark** for instant omni-search via the browser action icon.

---

## 2. Daily Usage: New Tab Page & Quick Access

- **Topology Status Pill**: Located in the top navigation bar, displaying your current IP and network status (Intranet detected vs Public network). Hover over it for a breakdown of detected network interfaces.
- **Hero Omni-Search**:
  - Type keywords to filter local bookmarks with sub-millisecond responsiveness.
  - Press `Enter` to search directly via the configured default search engine (Google, Bing, Baidu, or GitHub).
  - Quick-jump hotkey: Press `/` anywhere on the page to focus the search box.

---

## 3. Multidimensional Sorting

Select your preferred layout ordering in Preferences or via the sorting filter:
- **Custom (↕)**: Drag and drop bookmark cards directly across groups.
- **By Frequency (🔥)**: Automatically order bookmarks by historical click telemetry.
- **By Name (🔤)**: Alphabetical (A-Z) lexicographical order.
- **By Latency (⚡)**: Prioritize verified low-ping bookmarks.
- **By Date Added (🕒)**: Reverse chronological order.

---

## 4. Core Feature: Multi-Endpoint Routing Setup

When adding or editing a bookmark:
1. **Fill Basic Info**: Name, Icon (supports Lucide preset, custom uploaded images, or URL favicon extraction), and Tags.
2. **Add Endpoints**:
   - **Endpoint 1 (Intranet)**: e.g. `http://192.168.10.20:8080/gitlab`
   - **Endpoint 2 (VPN / Domain)**: e.g. `https://git.company.com`
3. **Automatic Routing**: Whenever you click the bookmark card, Smart Bookmark determines the best endpoint via 32-bit binary XOR prefix matching against your detected client IP and launches the route instantly.

---

## 5. Group & Tag Management

- **Frequently Used**: Automatically computed high-frequency bookmarks pinned at the top.
- **Custom Groups**: Organize bookmarks by team, project, or domain. Freely drag cards between groups or collapse headers.
- **Ungrouped**: Automatic safety container for bookmarks without an assigned group.

---

## 6. Import & Deduplication

- Click **Import** in the top navigation bar to read native browser bookmarks.
- View real-time deduplication flags (`Duplicate Detected`) to prevent cluttering your dashboard.

---

## 7. AI Auto-Organization

### Zero-Key Mode (No API Keys Required)
1. Open the **AI Organizer** modal.
2. Click **Copy Zero-Key Prompt** to place formatted bookmark structures onto your clipboard.
3. Paste into any Web LLM (ChatGPT, Claude, Kimi, DeepSeek).
4. Copy the LLM's returned JSON block and paste it back into Smart Bookmark.
5. Review the visual diff preview and click **Apply** to instantly update groups and tags.

### Direct API & MCP Bridge
- Configure your own OpenAI / DeepSeek / Ollama endpoint for one-click background execution.
- Enable the local MCP server bridge to allow Cursor or Claude Desktop to query and update bookmarks directly.

---

## 8. Data Backup & Snapshots

- **Auto Snapshots**: Created automatically before any major batch operation (e.g. AI reclassification or data reset).
- **One-Click Rollback**: Revert to any previous state in the **Backups** modal.
- **JSON Export / Import**: Export your complete bookmark and settings tree as an offline JSON backup.

---

## 9. Preferences & Localization

- **Theme**: Choose between Paper Sand (`paper-sand`), Ceramic Light (`ceramic-light`), or Obsidian Dark (`obsidian-dark`).
- **Language**: Switch between **System Default (Auto)**, **简体中文 (zh-CN)**, and **English (en-US)** with instant live hot-swapping.
- **Clock**: Toggle 12-hour or 24-hour display and animated seconds.
