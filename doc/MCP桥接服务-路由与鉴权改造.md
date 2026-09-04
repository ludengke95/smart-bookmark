# MCP 桥接服务：路由与鉴权改造设计

> **状态：待实现（Planned）**
> 关联代码：`packages/smart-bookmark-mcp/mcp-bridge.js`、扩展端 `src/services/mcp/client.js`
>
> 本文记录当前 MCP 桥接层的架构局限、改造目标与解决方案草案。尚未落地，需先确认路由策略（见 §5）后再实施。
>
> **语言 / Languages**：[English](./en/mcp-bridge-routing-auth.md) | 简体中文

## 1. 背景

MCP（Model Context Protocol）连接由三部分组成：

```
[AI 客户端 Cursor / Claude] --stdio(JSON-RPC)--> [mcp-bridge.js] --WebSocket--> [Smart Bookmark 扩展]
```

`smart-bookmark-mcp` 是一个零依赖 Node 进程，对 AI 客户端扮演 MCP server（stdio JSON-RPC），对浏览器扩展扮演 WebSocket server。它本身不实现任何书签逻辑，仅做传输层代理。

## 2. 需求 / 问题陈述

### 2.1 现状

- `extensionClients` 用 `Set` 维护，`handleMcpRequest` 对 `tools/list` / `tools/call` 走 `for (const client of extensionClients)` 全量广播。
- WebSocket 握手使用 `crypto.createHash('sha1')(secKey + 公开 GUID)` 计算 `Sec-WebSocket-Accept`，仅作协议合规校验。
- 扩展端连接后未上报任何身份信息，bridge 侧无「这是哪个扩展」的概念。

### 2.2 暴露的问题

1. **无法区分 / 路由客户端**：一次 `tools/call` 被所有连上的扩展处理。多实例（多个浏览器 / 多 profile）场景会出现重复处理、并竞争回写 stdout，AI 客户端收到错乱响应。
2. **无法防伪 / 鉴权**：SHA-1 握手中的魔数 GUID 写死在 RFC 6455 中、公开可知。任何能连上 `127.0.0.1:8333` 的本地进程都能冒充扩展，收走 AI 端转发出来的 tool 请求。bridge 无任何客户端身份或密钥校验。
3. **传输选型（已确认无需改动）**：当前使用 WebSocket 双向通道，方向为「扩展 = WS client、bridge = WS server」。经评估这是唯一务实方向——MCP 需要双向请求/响应，SSE 单向不适用；且 MV3 的 background Service Worker 事件驱动、不常驻监听端口，扩展无法作为 server 暴露接口供 bridge 反向调用。故**传输层保持 WebSocket 不变**，问题出在 WS 之上的协议层。

## 3. 目标

- [ ] **客户端身份识别**：每个扩展连接时上报唯一 `instanceId` 与元数据。
- [ ] **请求路由**：一次 `tools/call` 仅发给目标实例，不再广播。
- [ ] **响应关联**：依据 JSON-RPC `id` 将扩展回包匹配到对应请求后写回 stdout，丢弃非目标 / 迟到 / 重复响应。
- [ ] **（可选增强）鉴权**：握手后引入共享密钥校验，使 crypto 真正承担 auth 语义。

## 4. 解决方案草案

### 4.1 连接注册协议

扩展 WS 连接建立后，首先发送一条 `register` 消息：

```json
{
  "type": "register",
  "instanceId": "<uuid>",
  "meta": { "profile": "...", "version": "1.0.0" }
}
```

bridge 以 `Map<instanceId, { socket, meta }>` 取代现有 `Set`。

### 4.2 请求路由

- `tools/call` 携带可选 `target`（instanceId）。若无 `target`，按既定路由策略选定一个实例**单发**（见 §5 待定项）。
- 不再使用 `for...of` 广播，仅向目标 socket 写帧。

### 4.3 响应关联

- 扩展回包必须原样带回请求的 JSON-RPC `id`。
- bridge 维护 `Map<id, { pendingInstanceId }>`，收到响应后匹配并写 stdout；非目标实例或未知 `id` 的响应直接丢弃。
- `tools/list` 等无需严格请求-响应配对的场景，仍按现有「连接即有工具」逻辑（结合 `notifications/tools/list_changed`）。

### 4.4 鉴权（可选，独立于路由）

- 在 WebSocket 握手完成后、进入消息循环前，扩展须携带共享密钥（环境变量 / 配置文件）完成一次校验。
- 校验失败的扩展连接被立即关闭。此机制建立在 §4.1 身份识别之上，与路由正交。

### 4.5 明确不在范围内

- 不替换为 SSE（单向，不满足 MCP 双向语义）。
- 不改动传输层（仍为 WebSocket）。
- 不改变 bridge 的「薄代理」定位（书签逻辑仍在扩展端）。

## 5. 待定决策（阻塞实施）

**实际部署形态**决定路由策略写法：

- **(a) 基本只连一个扩展**：只需加身份识别 + 多实例拒绝（第二实例连接即拒或抢占），广播逻辑保留但加护栏，改动最小。
- **(b) 多浏览器 / 多 profile 并存**：需明确「一次 `tools/call` 路由给谁」——按 profile？按当前激活 tab？还是 sticky 归属（首个认领某工具的实例拥有它）？

决策落地后，再修改 `handleMcpRequest` 与 `extensionClients` 数据结构。

## 6. 影响面

| 文件 | 改动 |
|------|------|
| `packages/smart-bookmark-mcp/mcp-bridge.js` | `Set` → `Map<instanceId, socket>`；新增 `register` 处理；`tools/call` 单发；响应按 `id` 关联后写 stdout；（可选）共享密钥校验 |
| `src/services/mcp/client.js` | 扩展连接后发送 `register`；确保回包携带原始 JSON-RPC `id` |
| 协议版本 | 扩展端与 bridge 需就 `register` 消息与 `target` 字段达成兼容约定 |

## 7. 验收标准

- **单扩展场景**：行为与现状一致，AI 客户端无感。
- **多扩展场景**：仅目标实例处理请求；响应正确回传 stdout；非目标实例不参与。
- **伪造连接**：无有效身份 / 密钥的连接被拒绝或忽略，无法接收 tool 请求。
