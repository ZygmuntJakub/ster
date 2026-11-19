# Changelog

All notable changes to Ster are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Workspace scaffolding for `@ster/core`, `@ster/mock-agent`, and `@ster/desktop`
  (pnpm, TypeScript strict, ESLint, Prettier, Vitest, Playwright, Tailwind tokens).
- US1–US8 desktop ACP client: sessions, approvals, actions/plan, agents install, commands,
  multi-session history/resume, modes/models/slash commands, EN/PL language switching.
- US9–US12: adopter packaging/docs, organization policy, factory definitions, run records
  with rating/judging/JSON Lines export.
- Phase 15 polish: hostile-content suite, bridge hostile-renderer coverage, renderer network
  filter, TanStack Virtual conversation list, accessibility notes, release validation log.
- Adopter packaging: `electron-builder.config.mjs` (dmg/zip, NSIS, AppImage/deb) reading
  `apps/desktop/resources/brand.json`; draft GitHub Release workflow on `v*` tags.
- Example `PanelExtension` (`apps/desktop/src/extensions/`) and adopter docs under `docs/`.
- Headless example `examples/headless.ts` and integration coverage.

### Reference agents (SC-003 / T183)

Automated install/distribution coverage exercises **binary**, **npx**, and **uvx** paths via
the mock registry fixtures and unit/integration suites. A live run against three distinct
public-registry agents was **not** executed in this cloud-agent environment (no vendor CLI
logins). Treat the distribution-type tests as the recorded substitute until a release
engineer repeats the reference task with real registry agents.

### Extension contracts

Stable for adopters to depend on (breaking changes require an entry here — FR-062):

| Contract | Package / path |
|---|---|
| `PanelExtension` | `apps/desktop/src/extensions` |
| `AgentSource` | `@ster/core` |
| `PermissionModeDefinition` | `@ster/core` |
| `PolicyItemDefinition` | `@ster/core` |
| `SessionEventConsumer` | `@ster/core` |
| Translation resources | `apps/desktop/src/renderer/i18n/*.json` + `main/language.ts` |

**Policy for changes:** additive fields and new optional placements are non-breaking.
Renaming/removing fields, changing permission-mode confinement rules, or requiring new
registration steps is a **breaking** extension-contract change and must be called out in
the release notes for that version.
