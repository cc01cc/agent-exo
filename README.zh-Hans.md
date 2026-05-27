# Agent EXO

**AI Agent 外骨骼** — 跨平台插件、技能和工具集，为 AI 编程 agent 扩展能力。

> `EXO` 取自 **Exoskeleton（外骨骼）**——像一层外部装甲，为 AI agent 赋予超能力：消息通知、上下文感知、工具路由等。
>
>
> [English](README.md)

## 包

| 包 | 平台 | 描述 | 状态 |
|---------|----------|-------------|--------|
| [oc-tool-router](packages/oc-tool-router) | OpenCode | 智能 sub agent，分析对话上下文并推荐相关技能和 MCP 工具 | 稳定 |
| [oc-feishu-notifier](packages/oc-feishu-notifier) | OpenCode | 将会话事件（完成、错误、中断）发送到飞书 Webhook | Beta |

## 安装

### 前置要求

- Node.js >= 22
- pnpm >= 10
- [OpenCode](https://opencode.ai) 1.15.x

### 设置

```bash
# 克隆仓库
git clone https://github.com/cc01cc/agent-exo.git
cd agent-exo

# 安装依赖
pnpm install
```

### 插件安装（按项目）

每个插件通过将其配置文件放入目标项目对应路径的 `plugins/` 目录来安装。详情请参阅各个包的 README。

## 使用

### oc-tool-router

工具路由器插件作为一个上下文感知的 sub agent：

1. 监控正在进行的对话
2. 分析当前请求是否需要特定技能或 MCP 工具
3. 将建议注入到对话上下文中

配置 (`<项目>/.opencode/plugins/oc-tool-router/config.jsonc`):

```jsonc
{
  "enabled": true,
  "subagentModel": "deepseek-v4-flash",
  "subagentApiKey": "your-api-key-here",
  "subagentBaseURL": "https://api.deepseek.com/v1",
  "minIntervalMs": 3000
}
```

### oc-feishu-notifier

当 agent 会话完成、遇到错误或需要用户输入时，向飞书 Webhook 发送通知。

配置 (`<项目>/.opencode/plugins/oc-feishu-notifier/config.jsonc`):

```jsonc
{
  "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-id",
  "enableCardMessage": true,
  "notifyOn": {
    "chatComplete": false,
    "sessionIdle": true,
    "error": true,
    "interruption": true
  }
}
```

## 开发

```bash
# 代码检查
pnpm lint

# 类型检查
pnpm typecheck

# 测试
pnpm test
```

### 项目结构

```
agent-exo/
├── packages/
│   ├── oc-tool-router/        # 智能工具路由器插件
│   └── oc-feishu-notifier/    # 飞书通知插件
├── docs/
│   └── DEV-CONVENTION.md      # 插件开发规范
├── internal/                  # 内部发布工具（不公开发布）
└── package.json
```

## 许可

[Apache 2.0](LICENSE)
