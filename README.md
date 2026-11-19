# Ster

Ster is a desktop application for working with AI coding agents through the
[Agent Client Protocol](https://agentclientprotocol.com) (ACP). You pick an agent and a
project folder, see what the agent does, and approve what it may do.

It is published as an **open template**: rebrand it, restrict it with organization policy,
add panels and languages, and ship your own installers. This repository is the desktop
stage of that template.

## Prerequisites

- Node.js ≥ 24 (see `.nvmrc`)
- pnpm 10 (see `packageManager` in the root `package.json`)
- A coding agent that speaks ACP (or use the built-in mock agent while developing)

## Clone to run

```bash
git clone <this-repo>
cd ster
pnpm install
pnpm dev
```

Then start a session with the mock agent (development builds include it) or install a
registry / custom agent from the Agents screen.

Quality gates used in CI:

```bash
pnpm check
pnpm test:e2e
pnpm test:security
pnpm example:headless
```

## How login works

Ster never asks for model-provider API keys or subscription passwords. When an agent
requires login, Ster shows the methods the agent declares (in-app browser flow or a
terminal the vendor CLI expects). You complete the vendor’s own login; Ster only hosts
the session afterward.

**Subscription terms:** whether your vendor subscription may be used with a third-party
ACP client is governed by that vendor’s terms. Adopters and end users are responsible for
checking them before connecting a production agent.

## Installers and unsigned builds

Release tags (`v*`) build macOS (dmg + zip), Windows (NSIS), and Linux (AppImage + deb)
via `.github/workflows/release.yml`. Builds are **not developer-signed / notarized** in
this template; macOS artifacts carry an **ad hoc** signature so Apple silicon can launch
them. See [docs/signing.md](docs/signing.md) to plug in your certificates.

### Installing an unsigned build

| Platform | What you will see | How to proceed |
|---|---|---|
| macOS | “cannot be opened because the developer cannot be verified” | System Settings → Privacy & Security → Open Anyway, or right-click the app → Open |
| Windows | SmartScreen “Windows protected your PC” | More info → Run anyway (only if you trust the build source) |
| Linux | No SmartScreen equivalent; AppImage needs execute bit | `chmod +x *.AppImage` then run; for `.deb`, install with your package manager |

Prefer builds from a source you trust. Automatic in-app updates are out of scope until
signing is configured—update by installing a newer release.

## Repository layout

- `packages/core` — UI-independent ACP client core (also usable headless)
- `packages/mock-agent` — scriptable ACP agent for tests and `pnpm example:headless`
- `apps/desktop` — Electron application (main, preload, renderer, extensions)
- `docs/` — adopter guides (rebranding, languages, agents, extensions, signing, security)
- `specs/001-acp-desktop-client/` — specification, plan, research, tasks
- `design/mockup/index.html` — clickable design reference

## Adopter docs

- [Rebranding](docs/rebranding.md)
- [Adding a language](docs/adding-a-language.md)
- [Default agents](docs/default-agents.md)
- [Extensions](docs/extensions.md)
- [Signing](docs/signing.md)
- [Security model](docs/security-model.md)
- [Releasing](docs/releasing.md)

## License

MIT — see [LICENSE](LICENSE).
