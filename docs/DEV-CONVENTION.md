# Plugin Development Convention

## 目录结构规范

### 用户视角（实际使用位置）

插件配置在项目的 `.opencode/` 下：

```
.opencode/
└── plugins/
    ├── oc-tool-router/
    │   ├── config.jsonc        # ← 用户配置在此
    │   ├── data.jsonc          # 插件自动维护
    │   ├── cache/
    │   └── logs/
    │
    └── feishu-notifier/
        └── config.jsonc        # ← 用户配置在此
```

**用户不需要修改 `agent-exo/packages/` 下的任何文件。**

### 开发视角（插件源码位置）

源码在 `agent-exo/packages/<plugin-name>/` 下，每个包也有自己的 `config.jsonc` 作为默认模板参考：

```
agent-exo/
└── packages/
    ├── oc-tool-router/
    │   ├── config.jsonc        # 默认模板，供用户参考
    │   ├── src/
    │   ├── package.json
    │   └── data.jsonc          # 开发测试用默认值
    └── oc-feishu-notifier/
        ├── config.jsonc        # 默认模板
        └── src/
```

## 文件职责

| 文件 | 谁维护 | 内容 | 示例 |
|------|--------|------|------|
| `config.jsonc` | 用户 | API key、模型选择、开关等**配置** | `{ "enabled": true, "subagentModel": "..." }` |
| `data.jsonc` | 插件 | session ID、时间戳、计数器等**运行时状态** | `{ "lastTriggeredAt": 123 }` |
| `cache/*` | 插件 | MCP 工具索引、skill 索引等**可重建数据** | `mcp-index.json` |
| `logs/*.log` | 插件 | 运行日志，用于调试 | `2026-05-24.log` |

### config.jsonc（用户参与）

```jsonc
{
  "enabled": true,
  "subagentModel": "deepseek-v4-flash",
  "subagentApiKey": "oc-go-xxx",
  "subagentBaseURL": "https://opencode.ai/zen/go/v1",
  "minIntervalMs": 3000
}
```

用户可以随意修改、备份、迁移此文件。

### data.jsonc（插件维护）

```jsonc
{
  "lastTriggeredAt": 1747828800000,
  "subagentSessionId": "sess_abc"
}
```

用户不应手工编辑。删除后插件会用默认值重新生成。

## 包命名规范

```
packages/
  oc-<name>       # OpenCode 插件（@agent-exo/oc-<name>）
  kc-<name>       # KiloCode 插件（预留）
  rc-<name>       # Roo Code 插件（预留）
```

## 配置 vs 数据：判断原则

| 判断标准 | config | data |
|----------|--------|------|
| 用户需要知道这个值吗？ | ✅ 是 | ❌ 否 |
| 用户修改后会有行为变化吗？ | ✅ 会 | ❌ 不会 |
| 值在不同环境下不同？ | ✅ 是（如 API key） | ❌ 否 |
| 删除后插件能正常工作吗？ | ❌ 不能（需重新配置） | ✅ 可以（自动重建） |

## 日志规范

- 使用 `createFileLogger()` 写入 `logs/YYYY-MM-DD.log`
- 每行格式：`ISO时间 [LEVEL] 消息 {"extra":"json"}`
- 级别：`DEBUG` / `INFO` / `WARN` / `ERROR`
- 同时也调用 `client.app.log()` 写入 opencode 日志系统
