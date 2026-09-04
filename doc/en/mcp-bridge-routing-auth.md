# MCP Bridge: Routing & Authentication Refactor Design

> **Status: Planned (not yet implemented)**
> Related code: `packages/smart-bookmark-mcp/mcp-bridge.js`, extension side `src/services/mcp/client.js`
>
> This document records the current architectural limitations of the MCP bridge layer, the refactor goals, and a draft solution. Not yet implemented — the routing strategy (see §5) must be confirmed before implementation.
>
> **Languages**: English | [简体中文](../MCP桥接服务-路由与鉴权改造.md)

## 1. Background

An MCP (Model Context Protocol) connection consists of three parts:

```
[AI client Cursor / Claude] --stdio(JSON-RPC)--> [mcp-bridge.js] --WebSocket--> [Smart Bookmark extension]
```

`smart-bookmark-mcp` is a zero-dependency Node process that acts as an MCP server (stdio JSON-RPC) toward the AI client, and as a WebSocket server toward the browser extension. It implements no bookmark logic itself — it is purely a transport-layer proxy.

## 2. Requirements / Problem Statement

### 2.1 Current state

- `extensionClients` is maintained as a `Set`; `handleMcpRequest` broadcasts every `tools/list` / `tools/call` via `for (const client of extensionClients)`.
- The WebSocket handshake uses `crypto.createHash('sha1')(secKey + public GUID)` to compute `Sec-WebSocket-Accept`, which is only a protocol-compliance check.
- The extension reports no identity information upon connecting; the bridge has no concept of "which extension is this".

### 2.2 Exposed problems

1. **Cannot distinguish / route clients**: a single `tools/call` is processed by all connected extensions. In multi-instance scenarios (multiple browsers / multiple profiles) this causes duplicate processing and races to write back to stdout, so the AI client receives corrupted responses.
2. **No spoofing prevention / authentication**: the magic GUID in the SHA-1 handshake is hard-coded in RFC 6455 and thus publicly known. Any local process that can reach `127.0.0.1:8333` can impersonate an extension and intercept the tool requests forwarded from the AI side. The bridge performs no client identity or key validation.
3. **Transport choice (confirmed: no change needed)**: the current WebSocket bidirectional channel uses the direction "extension = WS client, bridge = WS server". This is the only pragmatic direction — MCP requires bidirectional request/response, so SSE (unidirectional) does not fit; and MV3's event-driven background Service Worker does not persistently listen on a port, so the extension cannot act as a server exposing an interface for the bridge to call back. Therefore **the transport layer stays WebSocket unchanged**; the problem lies in the protocol layer above WS.

## 3. Goals

- [ ] **Client identity**: each extension reports a unique `instanceId` and metadata upon connecting.
- [ ] **Request routing**: a single `tools/call` is sent only to the target instance, no longer broadcast.
- [ ] **Response correlation**: correlate the extension's reply to its request by JSON-RPC `id`, then write to stdout; drop non-target / late / duplicate responses.
- [ ] **(Optional enhancement) Authentication**: introduce a shared-key check after the handshake so that crypto genuinely carries auth semantics.

## 4. Draft Solution

### 4.1 Connection registration protocol

After the extension's WS connection is established, it first sends a `register` message:

```json
{
  "type": "register",
  "instanceId": "<uuid>",
  "meta": { "profile": "...", "version": "1.0.0" }
}
```

The bridge replaces the existing `Set` with `Map<instanceId, { socket, meta }>`.

### 4.2 Request routing

- `tools/call` carries an optional `target` (instanceId). If no `target` is present, select one instance per the routing strategy and **send to it alone** (see §5 open item).
- No more `for...of` broadcast; write the frame only to the target socket.

### 4.3 Response correlation

- The extension's reply must echo back the original request's JSON-RPC `id` verbatim.
- The bridge maintains `Map<id, { pendingInstanceId }>`; upon receiving a response it correlates and writes to stdout; responses from non-target instances or with unknown `id` are dropped.
- Scenarios like `tools/list` that do not require strict request-response pairing still follow the existing "tools available upon connect" logic (combined with `notifications/tools/list_changed`).

### 4.4 Authentication (optional, orthogonal to routing)

- After the WebSocket handshake completes and before entering the message loop, the extension must present a shared key (env var / config file) for a one-time validation.
- Connections that fail validation are closed immediately. This mechanism builds on the §4.1 identity layer and is orthogonal to routing.

### 4.5 Explicitly out of scope

- Not switching to SSE (unidirectional, does not satisfy MCP's bidirectional semantics).
- Not changing the transport layer (still WebSocket).
- Not changing the bridge's "thin proxy" positioning (bookmark logic stays on the extension side).

## 5. Open decisions (blocking implementation)

**The actual deployment shape** decides how the routing strategy is written:

- **(a) Basically only one extension connected**: only need identity + multi-instance rejection (second instance rejected on connect, or preempted); keep the broadcast logic but add guardrails; minimal change.
- **(b) Multiple browsers / multiple profiles coexist**: need to clarify "who does a single `tools/call` route to" — by profile? by currently active tab? or sticky ownership (the first instance to claim a tool owns it)?

After the decision lands, modify `handleMcpRequest` and the `extensionClients` data structure.

## 6. Impact

| File | Change |
|------|--------|
| `packages/smart-bookmark-mcp/mcp-bridge.js` | `Set` → `Map<instanceId, socket>`; add `register` handling; `tools/call` single-send; write to stdout after correlating by `id`; (optional) shared-key validation |
| `src/services/mcp/client.js` | extension sends `register` after connecting; ensure replies carry the original JSON-RPC `id` |
| Protocol version | extension and bridge must agree on the `register` message and `target` field for compatibility |

## 7. Acceptance criteria

- **Single-extension scenario**: behavior identical to current; AI client unaffected.
- **Multi-extension scenario**: only the target instance processes the request; response correctly returned to stdout; non-target instances do not participate.
- **Spoofed connection**: connections without valid identity / key are rejected or ignored and cannot receive tool requests.
