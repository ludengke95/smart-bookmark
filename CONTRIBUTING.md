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

1. 在 `release/vX.Y.Z` 分支更新版本号（根包 `package.json` 与子包 `packages/smart-bookmark-mcp/package.json` 按需同步）。
2. 合入 `master` 后打 tag 并推送：

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

3. 标签推送触发自动化链：
   - `release.yml`：构建扩展 + 打包 mcp → 用 conventional-changelog **自动生成 Release 正文**并创建 GitHub Release（附源码包 / 插件包 / mcp 包）。
   - `publish.yml`：Release 发布后自动 `npm publish`（依赖仓库 Secret `NPM_TOKEN`）。

## 5. 本地开发

- 运行环境：Node 22。
- 安装依赖：根包 `npm ci`；子包 `cd packages/smart-bookmark-mcp && npm ci`。
- 本地起 MCP 桥：`npm run mcp`（默认 `127.0.0.1:8333`）。
- 构建扩展：`npm run build`；打包 zip：`npm run zip`。
- 生成变更日志（本地预览）：`npm run release:notes`（产出 `RELEASE_NOTES.md`）。
