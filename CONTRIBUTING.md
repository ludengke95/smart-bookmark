# 开发规范（Contributing Guide）

> 本规范适用于 `smart-bookmark` 仓库。所有改动需遵循分支命名、提交信息格式与 PR 流程，确保 `master` 历史清晰、Release 可自动生成变更日志。

## 1. 分支模型

- 主分支为 `master`，**受保护、禁止直接 push**。所有改动必须通过 Pull Request 合入（管理员同样受限）。
- 从 `master` 切出特性分支开发，分支命名统一为：

  ```
  <type>/<kebab-case-描述>
  ```

  | 前缀 | 含义 | 示例 |
  |---|---|---|
  | `feat` | 新功能 | `feat/mcp-ws-sdk` |
  | `fix` | 缺陷修复 | `fix/zip-naming` |
  | `docs` | 文档 | `docs/contributing` |
  | `refactor` | 重构（无行为变化） | `refactor/mcp-bridge` |
  | `test` | 测试 | `test/bridge-e2e` |
  | `chore` | 构建/依赖/工程化 | `chore/deps-bump` |
  | `perf` | 性能优化 | `perf/storage-query` |
  | `ci` | CI / 工作流 | `ci/release-notes` |
  | `release` | 发布收尾（打 tag 前） | `release/v1.1.0` |

- 描述使用 kebab-case，英文或拼音均可，需能表达改动意图。

## 2. 提交信息规范（Conventional Commits）

格式：

```
<type>(<scope>): <subject>
```

- `type`：与分支前缀一致（`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf` / `ci` 等）。
- `scope`（可选）：改动模块，如 `mcp`、`zip`、`release`、`storage`。
- `subject`：祈使句、简洁、不以句号结尾。

示例：

```
refactor(mcp): 桥与扩展端改用 ws + 官方 sdk
ci(release): 触发改为 v* 标签，Release 附三类产物
fix(zip): 插件包命名加 v 前缀
```

- CI 通过 **commitlint** 校验每条提交信息。
- **PR 标题**也须为 conventional 格式（由 semantic-pull-request 校验），以便 Squash 合入后 `master` 的提交历史保持规范、可被 conventional-changelog 解析。

## 3. PR 流程

1. 从 `master` 切出 `<type>/<描述>` 分支开发并提交。
2. 推送分支，向 `master` 打开 Pull Request。
3. PR 标题须为 conventional 格式；至少 **1 个 approval** 后方可合入（单人项目可自审）。
4. 合入方式建议 **Squash and merge**，合入提交信息沿用 PR 标题（保持 conventional）。

## 4. 发布流程

1. 在 `release/vX.Y.Z` 分支更新版本号（仅修改根包 `package.json`，子包版本按「版本升级规范 §5.1」由发布脚本同步）。
2. 合入 `master` 后打 tag 并推送：

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

3. 标签推送触发自动化链：
   - `release.yml`：构建扩展 + 打包 mcp → 用 conventional-changelog **自动生成 Release 正文**并创建 GitHub Release（附源码包 / 插件包 / mcp 包）。
   - `publish.yml`：Release 发布后自动 `npm publish`（依赖仓库 Secret `NPM_TOKEN`）。

## 5. 版本升级规范

仓库存在三个版本面：扩展版本（用户可见，来自 `manifest.version`）、根包版本（`package.json`，用于 zip 命名）、npm 子包版本（`packages/smart-bookmark-mcp/package.json`）。为避免版本漂移，统一遵循以下规则。

### 5.1 单一真相源

- 根包 `package.json` 的 `version` 为**唯一版本真相源**。
- `wxt.config.js` 的 `manifest.version` 须**派生自根包 `package.json`**（而非硬编码），确保扩展内部版本号与 zip 命名 `{{packageVersion}}` 永远一致。
- npm 子包版本与根包**联动（lockstep）**：发布时由脚本把根包 `version` 同步写入子包 `package.json`，二者同号、同步发布。

### 5.2 语义化版本映射

采用三段式 `MAJOR.MINOR.PATCH`（Chrome `manifest.version` 仅支持 0–4 段数字）：

| bump | 触发条件 |
|------|---------|
| **MAJOR** | 破坏性变更：manifest 权限增删、`storage` key 结构变化、桥接协议不兼容 |
| **MINOR** | 向后兼容的新功能 |
| **PATCH** | 向后兼容的缺陷修复 |

### 5.3 标签与发布

- 单一 tag 命名：`vX.Y.Z`（不为子包另设前缀）。
- 打 tag 即触发现有自动化链：`release.yml`（构建扩展 + 打包 mcp + 自动生成 Release 正文并创建 GitHub Release）与 `publish.yml`（Release 发布后 `npm publish`）。
- 暂不支持预发布通道（如 `1.1.0-beta.1`）；后续如需商店 Beta 渠道再补充。

### 5.4 桥接协议兼容闸门

无论版本如何 bump，桥接协议变更须在扩展端与 Node 端各维护一份 `PROTOCOL_VERSION` 常量。ws 握手时双向校验：不匹配时桥主动返回明确的「请升级扩展/桥到 vX」错误，避免静默失联。协议不兼容的变更必须升级 **MAJOR**。

### 5.5 发布步骤（纪律）

1. 在 `release/vX.Y.Z` 分支，仅修改根包 `package.json` 的 `version`（子包由发布脚本同步）。
2. 合入 `master`，打 `vX.Y.Z` 并推送触发自动化链（见 §4）。
3. 人工上架：本地 `npm run zip` 后，去 Chrome Web Store 后台上传 `smart-bookmark-vX.Y.Z-chrome.zip` 并发布（商店不接受自动发布）。

## 6. 本地开发

- 运行环境：Node 22。
- 安装依赖：根包 `npm ci`；子包 `cd packages/smart-bookmark-mcp && npm ci`。
- 本地起 MCP 桥：`npm run mcp`（默认 `127.0.0.1:8333`）。
- 构建扩展：`npm run build`；打包 zip：`npm run zip`。
- 生成变更日志（本地预览）：`npm run release:notes`（产出 `RELEASE_NOTES.md`）。
