# Agent EXO — AI Agent 外骨骼

## 项目简介

跨平台 AI 编程 agent 插件集合，提供工具路由、消息通知等扩展能力。pnpm workspace monorepo。

## 技术栈

| 工具 | 版本 |
|------|------|
| TypeScript | ^6.0 |
| pnpm | >=10 |
| Node.js | >=18 |
| Oxlint | ^1.63 |
| Vitest | ^4.1 |
| 运行时 | OpenCode 1.15.x |

## 命令

所有命令在项目根目录执行，使用 `pnpm`（非 npm）。

| 命令 | 说明 |
|------|------|
| `pnpm lint:oxlint` | Oxlint 代码检查（.oxlintrc.json 配置） |
| `pnpm typecheck` | TypeScript 类型检查（tsc --noEmit，逐包执行） |
| `pnpm test` | Vitest 测试（尚无测试用例） |
| `pnpm lint` | 完整检查：lint:oxlint + typecheck |

## 项目结构

```
agent-exo/
├── packages/
│   ├── oc-tool-router/        # @agent-exo/oc-tool-router — 工具路由插件
│   └── oc-feishu-notifier/    # @agent-exo/oc-feishu-notifier — 飞书通知插件
├── docs/
│   └── DEV-CONVENTION.md      # 插件开发规范
├── internal/scripts/          # 内部发布脚本
│   └── release-to-main.sh     # internal/develop → main 同步发布
├── .oxlintrc.json             # lint 规则配置
└── pnpm-workspace.yaml        # workspace 定义
```

## 代码规范

- **包命名**: `oc-`（OpenCode）/ `kc-`（KiloCode）/ `rc-`（Roo Code）前缀，npm 名 `@agent-exo/oc-<name>`
- **配置 vs 数据**: `config.jsonc` 由用户维护，`data.jsonc` 由插件自动管理，cache/logs 为运行时产物
- **日志**: 使用 `createFileLogger()`，格式 `ISO时间 [LEVEL] 消息 {"extra":"json"}`，级别 DEBUG/INFO/WARN/ERROR
- 详细规范见 `docs/DEV-CONVENTION.md`

## 分支与发布

- `internal/develop` — 开发分支
- `main` — 公开发布分支（通过 rsync 同步，不含 internal/）
- 发布流程: 在 `internal/develop` 执行 `bash internal/scripts/release-to-main.sh`，然后进入 `worktrees/main/` 提交并推送

## 权限

Agent 在以下操作无需额外确认：
- 编辑 `packages/*/src/` 下的源码
- 修改 `docs/DEV-CONVENTION.md`
- 执行 lint / typecheck / test
- 阅读所有文档和配置文件
- 创建 `.opencode/plugins/*/` 下的配置文件

需要确认的操作：
- 修改 `package.json` 依赖版本
- 修改 `.oxlintrc.json` 规则
- 执行发布脚本
- 修改 Git 分支或提交
- 修改 CI/CD 配置

## 参考

- [README.md](./README.md) — 英文说明
- [README.zh-Hans.md](./README.zh-Hans.md) — 中文说明
- [docs/DEV-CONVENTION.md](./docs/DEV-CONVENTION.md) — 插件开发规范
