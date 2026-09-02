# 🚀 Smart Bookmark 智能 AI 与 MCP 生态方案

本方案基于 **“通用大模型 API 治理 + MCP 跨进程开放生态”** 架构设计，兼顾高兼容性、极速响应与外部高智商大模型（Cursor / Claude Desktop）深度协同。

---

## 🌐 核心模块一：内置通用 AI 数据治理 (智能分组 & 智能标签)

### 1. 技术选型与设计理念
- **标准 OpenAI 兼容协议**：无需依赖 Chrome Canary 或实验 Flag，兼容所有主流大模型服务：
  - **DeepSeek** (`https://api.deepseek.com/v1`, `deepseek-chat`) —— 中文语义理解顶尖，高性价比；
  - **OpenAI** (`https://api.openai.com/v1`, `gpt-4o-mini` / `gpt-4o`) —— 通用稳定；
  - **Ollama / vLLM (本地私有)** (`http://localhost:11434/v1`, `qwen2.5:7b`) —— 完全离线本地运行，隐私安全免 Key；
  - **自定义端点** —— 兼容任何自建或中转 API。
- **分批处理 (Batch Chunking)**：每批 20 项，有效规避上下文超出与速率限制。
- **双重 JSON 提取与容错**：自动剥离 Markdown 代码块、前置闲聊文本，确保结构化解析 100% 成功。
- **Diff 预览与选择性确认 (Selective Approval)**：AI 运行后弹出对比模态框，用户可逐项勾选确认后再应用入库。
- **自动安全快照**：每次执行 AI 批量分组或标签写入前，系统自动生成快照备份，支持一键无损回滚。

### 2. 核心操作
1. **✨ 智能分组 (Smart Grouping)**：
   - 依据书签名、拓扑 URL 及端点类型，分析语义归属。
   - 支持“仅未分组”或“全量书签”治理。
   - 可配置是否允许 AI 提议创建语义新分类（2-6字精炼短语）。
2. **🏷️ 智能标签 (Smart Tagging)**：
   - 提取 1-3 个技术栈、网络属性或业务分类标签（如 "Vue"、"内网运维"、"AI工具"）。
   - 支持“增量追加”或“重构覆盖”两种合并模式。

---

## 🔌 核心模块二：MCP (Model Context Protocol) 开放生态支持

### 1. 架构原理
通过轻量纯原生 Node.js 桥接中转器（零外部第三方依赖），连接外部大模型客户端与 Chrome 插件：

```
[外部 AI 客户端 (Cursor / Claude Desktop)]
       │ (通过 Stdio 标准输入输出 JSON-RPC)
[本地轻量 Node.js 桥接代理 (scripts/mcp-bridge.js)]
       │ (通过 127.0.0.1:8333 WebSocket 维持全双工通信)
[Chrome 插件 (实现完整 MCP 规范工具集)]
```

### 2. 插件注册的 MCP 核心工具清单 (11 项)
| 工具名称 | 描述说明 |
|---|---|
| `list_bookmarks` | 按关键词/标签/分组多维检索书签 |
| `get_bookmark` | 获取单个书签的内网/外网多端点及延迟详情 |
| `create_bookmark` | 快捷创建多端点书签 |
| `update_bookmark` | 修改书签名称、标签、端点地址与分组归属 |
| `delete_bookmark` | 安全删除书签 |
| `list_groups` | 获取包含常用与未分组在内的所有分组列表 |
| `create_group` | 创建自定义分组 |
| `batch_organize_bookmarks`| 批量迁移或归类书签分组（自动创建安全快照） |
| `batch_tag_bookmarks` | 批量追加或覆写书签标签（自动创建安全快照） |
| `get_system_stats` | 获取书签总数、点击热度分布、网络拓扑等统计数据 |
| `list_snapshots` | 检视系统自动备份的历史数据快照 |

### 3. 快速启动与配置

#### 启动本地中转服务：
```bash
npm run mcp
```

#### 在 Claude Desktop 中接入 (`claude_desktop_config.json`)：
```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "node",
      "args": ["G:\\java_workspace\\newtab\\scripts\\mcp-bridge.js"]
    }
  }
}
```

#### 在 Cursor 中接入 (Cursor Settings ➔ MCP)：
```json
{
  "mcpServers": {
    "smart-bookmark": {
      "command": "npm",
      "args": ["run", "mcp"]
    }
  }
}
```
