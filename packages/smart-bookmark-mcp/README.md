# @ludengke95/smart-bookmark-mcp

> **Languages**: [English](./README_EN.md) | 简体中文

**Smart Bookmark** 浏览器扩展（Chrome / Edge）的官方 MCP (Model Context Protocol) 桥接服务。

本服务允许各类主流大模型客户端（如 **Cursor**、**Claude Desktop**、**Windsurf**、**VS Code**、**CherryStudio**、**Dify**、**WorkBuddy** 等）通过标准化的 MCP 协议安全读取和管理你的书签、分组与标签。

## 🌟 架构亮点

- **Native Messaging 深度集成**：扩展通过 `chrome.runtime.connectNative` 唤起本地 Node 宿主，直接运行在 Background Service Worker 中，**无需保持前台 NewTab 标签页打开**。
- **Streamable HTTP / SSE 原生端点**：提供标准的 `http://127.0.0.1:8333/mcp` 与 `/sse`，原生适配 CherryStudio、Dify、NextChat 等现代 Web/桌面客户端。
- **Stdio 透明代理**：提供 `smart-bookmark-mcp stdio` 命令，为 Cursor / Claude Desktop 等仅支持 stdio 的编辑器提供开箱即用的桥接。
- **跨平台一键注册**：支持 Windows 注册表（HKCU）、macOS 与 Linux 清单文件的全自动写入，同时支持 Chrome 与 Edge。

> 📘 完整图文配置教程请查阅：[../../doc/MCP配置使用手册.md](../../doc/MCP配置使用手册.md)

---

## 🚀 快速上手（三步完成）

### 第一步：一键注册 Native Messaging 宿主

在终端中执行以下命令（自动在 Chrome / Edge 中注册 Native Host）：

```bash
npx -y @ludengke95/smart-bookmark-mcp register
```

> 若需要交互式自动配置 AI 客户端，亦可运行 `npx -y @ludengke95/smart-bookmark-mcp install`。

### 第二步：在浏览器扩展中开启 MCP

1. 打开 Smart Bookmark 扩展的「设置」→「MCP 协议」。
2. 开启「启用 MCP 宿主服务」开关（默认端口 `8333`，连接状态将显示为绿色的 `Native 活跃`）。

### 第三步：配置 AI 客户端

将生成的配置直接填入你的大模型客户端中：

#### 1. 代码编辑器（Cursor / Claude Desktop / Windsurf）

在 `mcp.json`（或 `claude_desktop_config.json`）中添加：

```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npx",
      "args": ["-y", "@ludengke95/smart-bookmark-mcp", "stdio"]
    }
  }
}
```

#### 2. Web / 桌面客户端（CherryStudio / Dify 等）

直接添加 **Streamable HTTP** 端点：
- **URL**: `http://127.0.0.1:8333/mcp`
- **类型**: Streamable HTTP / SSE

---

## 🛠️ CLI 命令一览

`@ludengke95/smart-bookmark-mcp` 提供丰富的子命令：

```bash
# 注册 Chrome / Edge Native Messaging 宿主配置
smart-bookmark-mcp register

# 注销 Native Messaging 宿主配置
smart-bookmark-mcp unregister

# 启动 Stdio 模式代理（供 Cursor / Claude Desktop 通过 stdio 调用）
smart-bookmark-mcp stdio

# 交互式 AI 客户端配置向导
smart-bookmark-mcp install

# 作为浏览器 Native Messaging 宿主运行（由浏览器底层进程自动拉起）
smart-bookmark-mcp native
```

### Stdio 代理选项

| 参数 / 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `--host <host>` | `127.0.0.1` | 目标 HTTP 服务监听地址 |
| `--port <port>` | `8333` | 目标 HTTP 服务监听端口 |
| `SMART_BOOKMARK_MCP_HOST` | `127.0.0.1` | 环境变量：目标地址 |
| `SMART_BOOKMARK_MCP_PORT` | `8333` | 环境变量：目标端口 |

---

## 🧩 架构原理解析

```
[AI 客户端 (Cursor / Claude)]        [AI 客户端 (CherryStudio / Dify)]
        │ stdio                                      │ Streamable HTTP (/mcp)
        ▼                                            ▼
[smart-bookmark-mcp stdio] ───────────► [Native Host HTTP Server (:8333)]
                                                     │ 4-byte LE framing
                                                     ▼
                                      [Chrome / Edge Native Host]
                                                     │ chrome.runtime.connectNative
                                                     ▼
                                      [Smart Bookmark Service Worker]
                                                     │ Dexie.js (IndexedDB)
                                      [本地书签 / 分组 / 标签数据库]
```

---

## 📦 支持的 MCP 工具列表（17 个）

| 工具名称 (Tool) | 分类 | 说明 |
|---|---|---|
| `list_bookmarks` | 查询 | 查询书签列表，支持按关键词（书签名称/标签/多入口URL）、分组 ID、标签组合过滤，内置 `limit` 与 `offset` 分页保护。 |
| `get_groups` | 查询 | 获取所有自定义分组与内置分组（常用组、未分组），包含各分组的书签统计数与可分配标记。 |
| `get_tags` | 查询 | 获取所有已使用的标签、使用频次与点击统计，按使用热度降序返回。 |
| `create_bookmark` | 变更 | 创建新书签，支持配置主入口 URL、所属分组、标签列表与多入口网络拓扑（内网/外网/直连）。 |
| `update_bookmark` | 变更 | 更新现有书签的标题、主入口 URL、多入口寻径列表、所属分组与标签（支持 `replace`、`append`、`remove` 模式）。 |
| `delete_bookmark` | 变更 | 根据书签 ID 删除单条书签。 |
| `batch_delete_bookmarks` | 变更 | 根据 ID 数组批量删除多个书签，单次事务高效执行。 |
| `create_group` | 变更 | 创建新的自定义书签分组。 |
| `update_group` | 变更 | 重命名或更新现有自定义书签分组。 |
| `delete_group` | 变更 | 删除指定自定义书签分组，组内书签安全归入未分组。 |
| `rename_tag` | 变更 | 全局重命名或合并标签（自动去重合并，操作前自动备份快照）。 |
| `delete_tag` | 变更 | 全局从所有书签中彻底剥离指定标签（操作前自动备份快照）。 |
| `batch_organize_bookmarks` | 变更 | 批量执行书签智能重构：迁移分组与增删标签，原子事务执行并自动生成快照。 |
| `list_snapshots` | 容灾 | 查看历史安全备份快照列表。 |
| `rollback_snapshot` | 容灾 | 一键将书签、分组与设置回滚恢复到指定快照。 |
| `get_network_topology` | 系统 | 获取扩展探测到的本地局域网物理网卡信息、已探测内网 IP 列表及延迟测速缓存。 |
| `export_full_data` | 备份 | 导出包含所有书签、分组与设置的完整备份 JSON 数据。 |

---

## ❓ 常见问题与排查

1. **执行 `smart-bookmark-mcp register` 后提示成功，但扩展界面仍显示未注册？**
   - 注册后请完全重启 Chrome 或 Edge 浏览器以加载新的 Native Messaging 宿主配置。
2. **AI 客户端提示无法连接到 `http://127.0.0.1:8333/mcp`？**
   - 请确保 Chrome / Edge 处于运行状态，且扩展设置中的「启用 MCP 宿主服务」已开启。
3. **局域网内其他设备如何访问？**
   - 在扩展设置的 MCP 高级选项中开启「允许局域网访问」，服务将监听 `0.0.0.0:8333`。请注意仅在受信任局域网中使用。

---

## 📄 开源协议

MIT License © ludengke95
