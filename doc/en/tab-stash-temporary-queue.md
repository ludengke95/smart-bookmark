# Tab Stash & Temporary Queue Design Spec

> **Languages**: English | [简体中文](../标签页临时暂存托盘设计方案.md)

## 1. Background & User Pain Points

During daily debugging, research, and technical spike sessions, engineers frequently face:
1. **Tab Explosion**: Opening 20-30 tabs (Stack Overflow, GitHub issues/PRs, architecture blogs, API docs) within minutes.
2. **Mental Model Mismatch & Bookmark Pollution**:
   - Saving temporary pages as regular bookmarks rapidly pollutes the curated multi-endpoint workspace into a "digital landfill".
   - Closing all tabs risks losing vital diagnostic context and trails.
3. **Heavy Readers are Antipatterns**:
   - Engineers rarely need Pocket/Instapaper-style article reader modes on desktop; they need lightweight session stashing, RAM release, and one-click resumption.

---

## 2. Core Positioning: Tab Stash vs. Traditional Read-It-Later

| Dimension | Read-It-Later (Pocket / Reader) | Smart Bookmark Tab Stash |
| :--- | :--- | :--- |
| **Content** | Long articles, news, essays | Debugging sessions, temporary issues, code snippets |
| **Storage** | Full-text parser, reader view, cache | Lightweight metadata (Title, URL, Favicon, Timestamp) |
| **Lifecycle** | Indefinite hoarding, manual archive | **Self-decay (TTL)**, read-and-clear, session restore |
| **Workspace** | Blended with primary bookmarks | **Physically isolated** (independent drawer, zero rank pollution) |

---

## 3. Design & Key Workflows

### 1. Physical Isolation
- Dedicated Dexie table `stashedTabs` completely isolated from `bookmarks`.
- Integrated as a collapsible drawer/tray on New Tab, never mixed into the primary grid or topology rank algorithms.

### 2. Capture & Session Stashing
- **One-Click Stash Window**: Quickly stashes all active tabs in the current window to free RAM, grouping them as a session (e.g., `Debug Session - 09-10 16:30`).
- **Single Tab Quick Stash**: Action available via Popup and keyboard shortcuts.

### 3. Anti-Hoarding Self-Decay (TTL)
- **Read & Clear**: Clicking to restore an item removes or marks it read.
- **Auto-Decay**: 7-day TTL by default; unread items sink to history and auto-prune after 30 days.

### 4. Promote to Bookmark
- Valuable long-term references can be promoted to official bookmarks with groups and multiple endpoints in one click.

---

## 4. Acceptance Criteria

- [ ] New Tab features an unobtrusive, collapsible stash drawer adhering to token design standards.
- [ ] Supports one-click stashing of all valid tabs in current window to release memory.
- [ ] Stashed entries never pollute primary bookmarks or click heat rankings.
- [ ] Stashed items support read-and-clear and one-click promotion to multi-endpoint bookmarks.
- [ ] 7-day default self-decay TTL stored in local IndexedDB.
