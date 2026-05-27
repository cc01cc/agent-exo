# Contributing to Agent EXO

Thank you for your interest in contributing! Here's how you can help.

## Development Setup

```bash
git clone https://github.com/cc01cc/agent-exo.git
cd agent-exo
pnpm install
```

## Code Quality

Before submitting changes, ensure all quality gates pass:

```bash
pnpm lint        # Lint check (oxlint)
pnpm typecheck   # TypeScript type check
pnpm test        # Run tests
```

## Commit Convention

We use conventional commit messages:

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Test changes
- `chore:` — Build/config changes

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes and ensure all quality gates pass
4. Commit using conventional commit format
5. Push and open a Pull Request
6. Ensure the CI pipeline passes

## Plugin Development

See [DEV-CONVENTION.md](docs/DEV-CONVENTION.md) for plugin architecture and naming conventions.
