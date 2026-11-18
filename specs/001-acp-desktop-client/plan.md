# Implementation Plan: Ster — ACP Desktop Client

**Branch**: `001-acp-desktop-client` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-acp-desktop-client/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Ster is a desktop application that acts as an Agent Client Protocol client: it starts any
ACP agent as a local subprocess, shows its work (streamed text, actions, diffs, plan),
mediates every approval through a selectable permission mode, lets the agent read files
and run commands inside the working folder, and keeps sessions, history, and run records
on the user's machine. It is published as an MIT template that an organization can
rebrand, restrict with policy, and extend.

Technical approach: a pnpm workspace with a UI-independent **core** package (protocol,
agents, sessions, permissions, policy, factory definition, storage, run records, event
stream) built on the official ACP TypeScript SDK; an Electron **desktop** application whose
main process hosts the core, whose preload exposes a narrow validated bridge, and whose
sandboxed React renderer is the only place that assumes a person at a screen; and a
**mock agent** package used by tests and by adopters. Decisions and their evidence are in
[research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (current stable, `strict` plus `noUncheckedIndexedAccess`
and `exactOptionalPropertyTypes`), ESM. Node.js >= 24 for development and for the core.

**Primary Dependencies**: Electron; `@agentclientprotocol/sdk` 2.x (stable entrypoint);
zod; React; Vite via electron-vite; Tailwind CSS; Radix primitives; Zustand; TanStack
Virtual; i18next; `react-markdown`; `diff`; `yaml`; `node-pty` + `xterm.js` (login terminal
only); electron-builder.

**Storage**: one local SQLite database per user through a `Store` interface (`node:sqlite`,
fallback `better-sqlite3`); installed agents and the managed Node runtime as files under
the application data directory; JSON for policy; YAML for the factory definition.

**Testing**: Vitest (unit and integration against `mock-agent`, v8 coverage, 80% line
threshold on `packages/core`); Playwright driving Electron for end-to-end flows; a hostile
content suite for agent output and factory definitions.

**Target Platform**: desktop — macOS (arm64, x64), Windows (x64, arm64), Linux (x64, arm64).

**Project Type**: desktop application in a small monorepo (headless core library + app).

**Performance Goals**: first visible agent output < 1 s after emission; session switch
< 1 s with 5 concurrent sessions; 1,000-item conversation without input lag; first launch
to first reply < 2 min for a logged-in agent.

**Constraints**: no project-operated backend; network use limited to the registry in
effect and resources it hosts, user-confirmed agent downloads, and the pinned,
checksum-verified Node runtime named in the install confirmation (constitution 1.4.0);
never handles model-provider credentials; renderer sandboxed; all user-visible strings
translated (EN, PL); installers without developer signature or notarization in this version (macOS: ad hoc).

**Interface**: "mission control" layout (icon rail, session board, conversation) in a
monochrome visual language; reference mockup in `design/mockup/index.html` (research.md R20).

**Scale/Scope**: single user per machine; tens of sessions and tens of thousands of run
records; 12 user stories, 76 functional requirements; about 10 screens/panels.

**Open items to confirm in the first tasks** (not blockers; fallbacks are defined):
`node:sqlite` availability in the chosen Electron version (R10); `node-pty` prebuilt
binaries for all six targets (R3).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status | Evidence |
|---|---|---|---|
| I. Protocol-First, Agent-Agnostic | Official SDK, stdio subprocess; no agent-specific branches; features gated by advertised capabilities | PASS | R1, R2; agent-specific knowledge is data only (`agent-hints.json`, R8) |
| II. User-Owned Credentials | No keys or tokens handled; login delegated; nothing uploaded | PASS | R3 (agent- and terminal-type auth run the vendor's own flow); R15 export is local |
| III. Explicit Consent and Least Privilege | Every request resolved by the selected mode; operations confined to the folder; explicit install/start; sandboxed UI; policy only restricts | PASS | R13 engine, guard, and no forwarding of standing permission; R6 confirmations; R9; R11; limits of confinement disclosed (FR-015) |
| IV. Simple, Extensible Core | Three layers; core independent of UI and shell; typed extension contracts; EN/PL complete | PASS | Project structure below; [contracts/core-api.md](./contracts/core-api.md); R16 |
| V. Tested Protocol Boundary | Tests against a mock agent incl. streaming, permissions, cancel, crash; CI on three systems | PASS | `packages/mock-agent`; R17 |
| VI. Secure by Default | Untrusted agent input; validated bridge; hardened shell; verified downloads; untrusted repository config; audited dependencies; security impact stated | PASS with noted limits | R6, R9, R12; limits recorded below |
| VII. Code Quality Gates | Strict compiler and linter; automated format; 80% core coverage; e2e per story; review | PASS | R17; CI definition in tasks |

**Security impact of this feature** (required by Principle VI):

- *New trusted input*: none by default. Registry index, agent output, and factory
  definitions are all treated as untrusted and validated.
- *New privileges*: starting third-party programs; reading and writing files and running
  commands in a user-chosen folder; downloading and installing agents and one Node runtime.
- *Abuse paths and mitigations*: a hostile agent or prompt-injected agent tries to act
  outside the folder (symlink-resolved confinement and guard, R13); a hostile repository
  ships a factory definition (per-folder trust bound to content hash, R12); a tampered
  download (SHA-256 when published, hash recorded and re-checked before each start, R6);
  hostile Markdown or links (no raw HTML, no remote images, confirmed external open, R9);
  a compromised renderer (sandbox plus schema-validated bridge without raw paths, R9).
- *Known limits*: 37 of 145 registry binaries and all npm packages have no published hash,
  so first install of those is unverifiable; the user is told and policy can forbid it
  (`requireChecksum`). A judging agent that ignores permission requests cannot be forced
  read-only by a client (R15).

**Re-check after cross-artifact analysis (constitution 1.4.0)**: PASS. The Node runtime
download is now covered by the amended network constraint; remembered decisions are kept
by the application and never forwarded to agents (R13); registry-hosted icons follow the
registry in effect (R5); US9, which has no in-application flow, meets the end-to-end rule
of Principle VII through a smoke test of the packaged build.

**Post-design re-check (after Phase 1)**: PASS. The data model and contracts introduce no
agent-specific types, no credential fields, and no path-carrying bridge messages. Three
deviations from the simplest possible design are recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-acp-desktop-client/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── core-api.md              # Headless core API, session events, extension contracts
│   ├── ipc.md                   # Bridge between renderer and main process
│   ├── policy.schema.json       # Organization policy
│   ├── factory.schema.json      # Factory definition (.ster/factory.yaml)
│   └── run-record.schema.json   # Run record export (JSON Lines)
├── checklists/requirements.md
└── tasks.md             # Created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/
├── core/                        # UI-independent; no Electron or DOM imports
│   ├── src/
│   │   ├── acp/                 # connection, capability negotiation, update queue
│   │   ├── agents/              # registry client, detection, install, integrity, launch
│   │   ├── sessions/            # session lifecycle, conversation items, resume
│   │   ├── permissions/         # modes, rules, client-side guard
│   │   ├── workspace/           # confined file access, command runner
│   │   ├── policy/              # load, validate, merge, enforce
│   │   ├── factory/             # definition lookup, validation, trust
│   │   ├── runs/                # run records, scoring, judging, export
│   │   ├── store/               # Store interface + SQLite implementation, migrations
│   │   ├── events/              # typed session event stream
│   │   ├── extensions/          # extension contracts and registries
│   │   └── index.ts             # public API
│   └── tests/
│       ├── unit/
│       ├── integration/         # against mock-agent
│       └── security/            # hostile content, paths, definitions
├── mock-agent/                  # scriptable ACP agent for tests and adopters
│   └── src/
└── (no other packages)

apps/
└── desktop/
    ├── src/
    │   ├── main/                # hosts core, windows, dialogs, login terminal, updates of agents
    │   ├── preload/             # typed bridge, channel allow-list
    │   ├── shared/              # bridge schemas (zod) and types used by main and renderer
    │   ├── renderer/
    │   │   ├── app/             # shell, routing, stores
    │   │   ├── features/        # conversation, actions, diff, plan, approvals, agents,
    │   │   │                    # terminal, sessions, runs, settings, policy, factory
    │   │   ├── components/      # shared UI primitives
    │   │   └── i18n/            # en.json, pl.json, typed keys
    │   └── extensions/          # adopter extensions and the single registration file
    ├── resources/               # brand.json, policy.default.json, agent-hints.json, icons
    ├── tests/e2e/               # Playwright, one flow per user story
    └── electron-builder.yml

examples/
└── headless.ts                  # drives core without a UI (proves FR-061)

design/
└── mockup/index.html            # clickable design reference (research.md R20)

docs/                            # adopter guide: rename, language, agents, panels,
                                 # policy, factory definition, signing, security model
.github/workflows/               # ci.yml (matrix), release.yml (installers)
```

**Structure Decision**: a pnpm workspace with two packages and one application. `core`
contains everything that must work without a person at a screen and is the part reused by
the later cloud stage; `desktop` is split into main, preload, and renderer to match the
three layers the constitution requires; `mock-agent` exists because Principle V demands
protocol tests against a controllable agent on all platforms.

## Delivery Increments

Each increment ends in a runnable, demonstrable application and passes all gates.

| Increment | Content | User stories |
|---|---|---|
| 0. Foundations | Workspace, CI matrix, lint/format/type gates, hardened Electron shell, bridge with validation, branding file, i18n mechanism, store and migrations, event stream, mock agent | — |
| 1. First usable version | Connect, prompt, stream, cancel, error recovery, login (both auth types); action cards, diffs, plan; permission engine, three modes, guard | US1, US2, US3 |
| 2. Agents and commands | Registry, detection, install with integrity, custom agents, updates, removal; command runner and output view | US4, US5 |
| 3. Sustained use | Multiple sessions, history, resume, attention signals; modes, models, commands; language switch and complete Polish | US6, US7, US8 |
| 4. Organization and release | Policy sources and enforcement, managed-setting markers; installers, release workflow, adopter documentation | US10, US9 |
| 5. Factory foundations | Factory definition with trust, task templates; run records, list and filters, rating, judging, export | US11, US12 |

Cross-cutting from increment 0 onward: translations for every new string, security tests
for every new input, extension contracts documented as they appear.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Native dependency (`node-pty`) despite "minimal dependencies" (IV) | The Claude adapter only offers terminal-type login; without an interactive terminal the application cannot offer in-app subscription login | Telling users to log in from their own terminal is kept as fallback, but as the only path it fails SC-001 for users without the vendor CLI |
| Managed Node.js runtime download | npm-distributed agents (23 of 46) need Node; Electron's run-as-Node mode is disabled by hardening (VI) | Using Electron as Node re-opens a known code-execution path; requiring system Node breaks the "one confirmation" install (SC-005) |
| Monorepo with three workspaces instead of one project | Principle IV requires a core independent of UI and shell; Principle V requires a controllable test agent | A single package cannot enforce the import boundary; folder conventions alone are easy to violate |
