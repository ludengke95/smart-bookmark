# Firefox Extension UX Optimization & Privacy Routing Fallback Spec

## Background & Pain Points

When developing and running Smart Bookmark in Firefox (MV2 / MV3), several environmental and security constraints arise:
1. **Missing Local IP due to WebRTC mDNS Obfuscation**:
   Per privacy standard RFC 8828, Firefox enables `media.peerconnection.ice.obfuscate_host_addresses` by default. Pure WebRTC ICE candidates are anonymized `.local` domains, and Firefox does not support `chrome.system.network`, preventing the extension from discovering the local LAN IPv4 address.
2. **Bookmark Permission Request Gesture Expiration & False Rejection**:
   Firefox enforces strict User Activation checks for `permissions.request`. Triggering it from `$effect` or async microtasks fails. Additionally, if bookmark scanning fails right after grant, broad catch blocks misclassify it as "unauthorized".
3. **Strict Dev-mode CSP Restrictions**:
   Firefox enforces tighter CSP constraints, requiring avoidance of `unsafe-eval` warnings during dev server HMR/probes.

---

## Proposed Solution & Design

### 1. Multi-tier Local IP Discovery & Graceful Fallback
- **Tier 1: Local MCP Bridge (Most Accurate)**:
  When the local MCP bridge (`packages/smart-bookmark-mcp`) is running, read true network interface addresses via Node.js `os.networkInterfaces()`.
- **Tier 2: Automatic Ping-Only Mode**:
  When local IP is absent, routing gracefully switches to latency/reachability-only mode. The fastest responding URL is selected as optimal.
- **Tier 3: UI Fallback Pill & Manual Subnet Input**:
  Display a "Privacy Mode / Ping-Only" pill in the top-left corner. Clicking it opens a light popover allowing users to optionally set their preferred LAN subnet (e.g. `192.168.1.x`) stored in IndexedDB.

### 2. Decoupled Bookmark Permission Lifecycle
- **Strict User-Gesture Binding**:
  Remove implicit requests on modal open; bind `permissions.request` strictly to explicit "Grant Permission" button clicks.
- **Decoupled Authorization & Scan States**:
  Granting permissions sets authorized state immediately; scanning failures show a data-fetch warning without demoting the authorization status to file-fallback.
- **Cross-Browser API Normalization**:
  Use `browser?.permissions || chrome?.permissions` promise wrapper.

---

## Impact Scope & Acceptance Criteria

1. **Affected Modules**:
   - `src/services/ip-detector.js`
   - `src/components/modals/ImportModal.svelte`
   - `src/state/app.svelte.js`
2. **Acceptance Criteria**:
   - The newtab loads cleanly on Firefox with clear routing/IP status indicators.
   - The Import modal does not error silently; clicking "Grant Permission" prompts the Firefox permission dialog and seamlessly scans bookmarks upon approval.
