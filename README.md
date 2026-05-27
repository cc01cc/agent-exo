# Agent EXO

**AI Agent Exoskeleton** — platform-agnostic plugins, skills, and tools that extend the capabilities of AI coding agents.

> `EXO` stands for **Exoskeleton** — like an external shell that equips AI agents with superpowers: communication, context awareness, tool routing, and more.
>
>
> [中文说明](README.zh-Hans.md)

## Packages

| Package | Platform | Description | Status |
|---------|----------|-------------|--------|
| [oc-tool-router](packages/oc-tool-router) | OpenCode | Smart subagent that analyzes conversation context and recommends relevant skills and MCP tools | Stable |
| [oc-feishu-notifier](packages/oc-feishu-notifier) | OpenCode | Sends session events (completion, error, interruptions) to Feishu (Lark) webhook | Beta |

## Installation

### Prerequisites

- Node.js >= 22
- pnpm >= 10
- [OpenCode](https://opencode.ai) 1.15.x

### Setup

```bash
# Clone the repository
git clone https://github.com/cc01cc/agent-exo.git
cd agent-exo

# Install dependencies
pnpm install
```

## Usage

### oc-tool-router

The tool router plugin acts as a context-aware subagent that:

1. Monitors the ongoing conversation
2. Analyzes whether the current request needs specific skills or MCP tools
3. Injects recommendations into the conversation context

Configuration (`<project>/.opencode/plugins/oc-tool-router/config.jsonc`):

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

Sends notifications to a Feishu webhook when OpenCode sessions complete, encounter errors, or require user input.

Configuration (`<project>/.opencode/plugins/oc-feishu-notifier/config.jsonc`):

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

## Development

```bash
# Lint
pnpm lint

# Type-check
pnpm typecheck

# Test
pnpm test
```

### Project Structure

```
agent-exo/
├── packages/
│   ├── oc-tool-router/        # Smart tool router plugin
│   └── oc-feishu-notifier/    # Feishu notification plugin
├── docs/
│   └── DEV-CONVENTION.md      # Plugin development conventions
├── internal/                  # Internal release tools (not published)
└── package.json
```

## License

[Apache 2.0](LICENSE)
