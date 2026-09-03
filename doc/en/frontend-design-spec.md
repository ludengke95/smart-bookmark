# Smart Bookmark - Minimalist Frontend Design System Specification

> **Languages / 语言**: English | [简体中文](../前端设计规范.md)
>
> **Document Version**: v1.0 (Minimalist Edition)  
> **Scope**: New Tab (`newtab`), Quick Action Popup (`popup`), Modals & Common UI Components  
> **Core Philosophy**: *"A New Tab page is a launchpad for thought, not a cluttered control room."*

---

## 1. Core Principles

1. **Subdued Calm**: Muted backgrounds and restrained contrast prevent cognitive overload.
2. **Precision Typography & Micro-indicators**: Clean font hierarchy combined with subtle status dots (`1.5px` - `2px`) conveys topology reachability cleanly without visual noise.
3. **Zero Jitter & Constant Dimensions**:
   - Modals maintain fixed spatial dimensions (e.g. `w-full max-w-xl h-[560px]`) regardless of tab switching.
   - Smooth CSS transitions (`duration-150` to `duration-200`) prevent jarring layout shifts.
4. **No Raw Native Elements**: Custom-designed primitives (`Select.svelte`, `Toast.svelte`) ensure full harmony with active theme CSS Tokens.

---

## 2. Color System & The 3 Themes

All styling strictly relies on semantic CSS Tokens mapped to CSS variables (`--color-surface`, `--color-canvas`, `--color-accent`, etc.).

### 2.1 The Three Themes
1. **Paper Sand (`paper-sand`)**:
   - Canvas: `#F5F2EB` (Warm Parchment)
   - Surface: `#EFECE4`
   - Accent: `#3A5A40` (Deep Forest Ink)
2. **Ceramic Light (`ceramic-light`)**:
   - Canvas: `#F6F7F9` (Bone China White)
   - Surface: `#FFFFFF`
   - Accent: `#1E293B` (Slate Graphite)
3. **Obsidian Dark (`obsidian-dark`)**:
   - Canvas: `#14161A` (Graphite Black)
   - Surface: `#1B1E24`
   - Accent: `#E2E7F0` (Starlight White)

### 2.2 Semantic Topology Micro-Colors
- **Intranet Direct**: `#22C55E` (Emerald Green)
- **Extranet Proxy**: `#3B82F6` (Sky Blue)
- **Unreachable / Error**: `#EF4444` (Rose Red)
- **Timeout Warning**: `#F59E0B` (Amber Orange)

---

## 3. Component Design Rules

### 3.1 Custom Select Primitive (`Select.svelte`)
- Native `<select>` elements are strictly forbidden.
- Custom popover menu matching theme tokens with keyboard focus and active checkmark indicators.

### 3.2 Toast Feedback Primitive (`Toast.svelte`)
- Center-floating, semi-transparent pill overlay with auto-dismiss (`duration-2000`).

### 3.3 Precision Route Bookmark Card (`BookmarkCard.svelte`)
- Displays favicon, bookmark title, and first 2 tags.
- Precision footer dot indicates computed reachability and route latency in real-time.
- Hover overlay reveals quick edit, delete, and multiple-endpoint inspection actions.
