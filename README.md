# Ster

Ster is a desktop application for working with AI coding agents through the
[Agent Client Protocol](https://agentclientprotocol.com) (ACP). You pick an agent and a
project folder, see what the agent does, and approve what it may do. It is designed as an
open template that an organization can rebrand, restrict with policy, and extend into its
own software factory.

**Status: implementation in progress on branch `001-acp-desktop-client`.**

## Requirements

- Node.js >= 24 (see `.nvmrc`)
- pnpm 10

## Setup

```bash
pnpm install
pnpm dev
```

## Quality gates

```bash
pnpm check
pnpm test:e2e
pnpm test:security
pnpm example:headless
```

## Repository layout

- `packages/core` — UI-independent ACP client core
- `packages/mock-agent` — scriptable ACP agent for tests
- `apps/desktop` — Electron application (main, preload, renderer)
- `specs/001-acp-desktop-client/` — specification, plan, research, tasks
- `design/mockup/index.html` — clickable design reference
- `.specify/memory/constitution.md` — project principles and quality gates

## License

MIT is planned. The `LICENSE` file is blocked until the copyright holder name is confirmed
(see `specs/001-acp-desktop-client/BLOCKERS.md`).
