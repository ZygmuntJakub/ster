---
description: "Task list for Ster — ACP Desktop Client"
---

# Tasks: Ster — ACP Desktop Client

**Input**: Design documents from `/specs/001-acp-desktop-client/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. The constitution (Principles V and VII) requires protocol tests against a mock agent, 80% line coverage of `packages/core`, at least one end-to-end test per user story, and security tests for every new untrusted input. Within a story, write the tests first and see them fail.

**Organization**: Tasks are grouped by user story in priority order. Each story phase ends in a runnable application that can be demonstrated on its own. Plan increments map to phases as: increment 0 = phases 1–2, increment 1 = phases 3–5, increment 2 = phases 6–7, increment 3 = phases 8–10, increment 4 = phases 11–12, increment 5 = phases 13–14.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: User story the task belongs to (US1–US12)
- Field constraints are defined once in [data-model.md](./data-model.md) and cited as `Entity.field`; tasks do not restate them.

## Path Conventions

- Core (no Electron or DOM imports): `packages/core/src/`, tests in `packages/core/tests/`
- Mock agent: `packages/mock-agent/src/`
- Desktop: `apps/desktop/src/{main,preload,shared,renderer,extensions}/`, resources in `apps/desktop/resources/`, end-to-end tests in `apps/desktop/tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace, toolchain, and quality gates

- [x] T001 Create the pnpm workspace: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ESM), `.nvmrc` (Node 24)
- [x] T002 [P] Scaffold `packages/core/` (`package.json` named `@ster/core`, `tsconfig.json`, `src/index.ts`) with `@agentclientprotocol/sdk` and `zod`
- [x] T003 [P] Scaffold `packages/mock-agent/` (`package.json`, `tsconfig.json`, `src/index.ts`, bin entry)
- [x] T004 Scaffold `apps/desktop/` with electron-vite: `electron.vite.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`
- [x] T005 [P] Configure ESLint (typescript-eslint strict-type-checked) and Prettier in `eslint.config.js` and `.prettierrc`, including an import-boundary rule that forbids `electron`, DOM, and `apps/*` imports inside `packages/core`
- [x] T006 [P] Configure Vitest with v8 coverage and an 80% line threshold in `packages/core/vitest.config.ts`
- [x] T007 [P] Configure Playwright for Electron in `apps/desktop/playwright.config.ts` with a launcher helper in `apps/desktop/tests/e2e/launch.ts`
- [x] T008 [P] Configure Tailwind CSS and base tokens (light and dark) in `apps/desktop/src/renderer/styles.css`, taking the tokens (colors, type, radii, light and dark sets) from `design/mockup/index.html` (research.md R20)
- [x] T009 Add root scripts `dev`, `check`, `test:e2e`, `test:security`, `example:headless` to `package.json` as defined in quickstart.md
- [x] T010 [P] Create the CI workflow `.github/workflows/ci.yml`: matrix macOS/Windows/Ubuntu running `pnpm check`, `pnpm test:e2e`, `pnpm test:security`, `pnpm audit --audit-level high`
- [x] T011 [P] Add `LICENSE` (MIT), `README.md` skeleton, `CHANGELOG.md`, and `SECURITY.md`
- [x] T012 Verify the two open items from plan.md in a throwaway spike and record the outcome in `specs/001-acp-desktop-client/research.md` (R3, R10): `node:sqlite` in the Electron main process, and `node-pty` prebuilt binaries for all six targets; switch to the documented fallback where needed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Everything every user story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T013 [P] Create `apps/desktop/resources/brand.json` and the `Brand` type and loader in `packages/core/src/brand.ts` (data-model.md `Brand`)
- [x] T014 [P] Implement `SterError` with the stable codes from contracts/core-api.md in `packages/core/src/errors.ts`
- [x] T015 [P] Implement a logger that redacts credentials and environment values in `packages/core/src/log.ts`, with tests in `packages/core/tests/unit/log.test.ts`
- [x] T016 Define the `Store` interface and the SQLite implementation with a migration runner in `packages/core/src/store/` (`store.ts`, `sqlite.ts`, `migrations/001_init.sql`), creating the data directory and database with user-only permissions (research.md R10)
- [x] T017 [P] Write store tests (migrations, ordered append, paging, permissions) in `packages/core/tests/unit/store.test.ts`
- [x] T018 [P] Implement the typed event stream with per-session ordering and the `CoreEvent` union from contracts/core-api.md in `packages/core/src/events/stream.ts`, with tests in `packages/core/tests/unit/events.test.ts`
- [x] T019 [P] Wire `SessionEventConsumer` extensions to the event stream in `packages/core/src/events/consumers.ts` (failures logged, never blocking a session), with tests in `packages/core/tests/unit/event-consumers.test.ts` (FR-060)
- [x] T020 [P] Define extension contracts and registries (`AgentSource`, `PermissionModeDefinition`, `PolicyItemDefinition`, `SessionEventConsumer`) in `packages/core/src/extensions/index.ts`
- [ ] T021 Implement the scriptable mock ACP agent in `packages/mock-agent/src/` with scenarios selected from prompt text: `hello`, `long`, `edit-file`, `plan`, `read-then-edit`, `escape-workspace`, `crash`, `hostile-content`, `run-command`, `run-long`, `auth-required`, `config-options`, `commands`, `usage`, `unknown-update`, `permission-always`, `write-after-external-edit`
- [x] T022 [P] Implement shell environment resolution with timeout and fallback in `packages/core/src/platform/shell-env.ts` (research.md R19), with tests in `packages/core/tests/unit/shell-env.test.ts`
- [ ] T023 Implement agent process management in `packages/core/src/acp/process.ts`: spawn with filtered environment (research.md R14), stderr capture to the log, process-tree termination on all three platforms, starting agents with the environment from `packages/core/src/platform/shell-env.ts`
- [ ] T024 Implement the ACP connection in `packages/core/src/acp/connection.ts`: `ndJsonStream` over the child's stdio, `initialize` with client capabilities, protocol version check (`protocol-unsupported`), capability snapshot, per-session serial queue for `session/update`
- [ ] T025 Write connection tests against the mock agent (handshake, ordering under concurrent updates, unsupported version, agent exit) in `packages/core/tests/integration/connection.test.ts`
- [ ] T026 [P] Implement `PolicyService` with source loading hooks and the `absent` state, plus enforcement call sites as no-ops, in `packages/core/src/policy/service.ts` (full behavior arrives in US10)
- [ ] T027 [P] Implement `SettingsService` in `packages/core/src/settings/service.ts` per data-model.md `Settings`: `Settings.language`, `Settings.defaultPermissionMode`, `Settings.defaultAgentId`, `Settings.customAgents`, `Settings.theme`
- [ ] T028 Implement `createCore` and `Core.dispose` in `packages/core/src/index.ts` per contracts/core-api.md
- [ ] T029 Implement the hardened window and application lifecycle in `apps/desktop/src/main/window.ts` and `apps/desktop/src/main/index.ts`: sandbox, context isolation, content security policy, navigation and `window.open` denial, permission-request denial (research.md R9)
- [ ] T030 [P] Configure Electron fuses and ASAR integrity in `apps/desktop/electron-builder.yml` and `apps/desktop/scripts/fuses.mjs` (research.md R9)
- [ ] T031 Implement the bridge infrastructure per contracts/ipc.md: schema registry in `apps/desktop/src/shared/bridge.ts`, validating handler registry with sender-frame check in `apps/desktop/src/main/bridge.ts`, fixed surface in `apps/desktop/src/preload/index.ts`; include `app.info`, `settings.get`, `settings.set`, `events.subscribe`
- [ ] T032 Write bridge tests in `apps/desktop/tests/bridge.test.ts`: preload surface equals the contract list, invalid payloads rejected, non-top-level sender rejected
- [ ] T033 [P] Set up i18next with typed keys in `apps/desktop/src/renderer/i18n/` (`index.ts`, `en.json`, `pl.json`) and a key-parity check in `scripts/check-i18n.mjs` wired into `pnpm check`
- [ ] T034 Build the renderer shell in `apps/desktop/src/renderer/app/` (`App.tsx`, `layout/`, `stores/`): sidebar, main area, settings entry, theme from `Settings.theme`, translation of `SterError` codes to messages, laid out as in the mockup: icon rail, session board area, conversation area (research.md R20)
- [ ] T035 [P] Write shell hardening tests in `apps/desktop/tests/e2e/hardening.spec.ts`: no Node globals in the page, navigation blocked, remote resource load blocked

**Checkpoint**: The application starts as an empty hardened shell in both languages, the core runs headless against the mock agent, and CI is green on three platforms

---

## Phase 3: User Story 1 - Converse with an agent in a project folder (Priority: P1) 🎯 MVP

**Goal**: Pick an available agent and a folder, send a request, watch the reply stream in, approve or reject requests, stop the agent, recover from errors, and log in when required

**Independent Test**: With the mock agent (and one real logged-in agent), start a session in a folder, send a request, see the reply stream and the turn end cleanly (quickstart.md, increment 1, rows 1, 2, 8, 10)

### Tests for User Story 1

- [ ] T036 [P] [US1] Integration tests for prompt, streaming, cancel, and agent crash in `packages/core/tests/integration/session-turn.test.ts`
- [ ] T037 [P] [US1] Integration tests for login-required and both auth method types in `packages/core/tests/integration/auth.test.ts`
- [ ] T038 [P] [US1] Security tests for file access confinement, including symlinks and `..`, in `packages/core/tests/security/workspace-paths.test.ts`
- [ ] T039 [P] [US1] End-to-end flow for US1 in `apps/desktop/tests/e2e/us1-conversation.spec.ts`

### Implementation for User Story 1

- [ ] T040 [P] [US1] Implement the `Agent` model and a minimal `AgentService` (`list`, `saveCustom`, `confirmFirstStart`) in `packages/core/src/agents/agent.ts` and `packages/core/src/agents/service.ts`; cite data-model.md `Agent.id`, `Agent.launch`, `Agent.confirmedAt`, `Agent.origin`; in development builds list the mock agent
- [ ] T041 [P] [US1] Implement the `Session` model and state machine in `packages/core/src/sessions/session.ts` per data-model.md `Session.status`, `Session.cwd`, `Session.title`
- [ ] T042 [P] [US1] Implement conversation item storage (append, in-place streaming update, paging) in `packages/core/src/sessions/items.ts` per data-model.md `ConversationItem.kind`
- [ ] T043 [US1] Implement the mapping from `session/update` variants to conversation items for message chunks, thought chunks, session info, and unknown variants in `packages/core/src/sessions/updates.ts`
- [ ] T044 [US1] Implement the run lifecycle skeleton (create on prompt, finalise on stop, `outcome` and `stopReason`) in `packages/core/src/runs/lifecycle.ts` per data-model.md `RunRecord.outcome`, `RunRecord.kind`
- [ ] T045 [US1] Implement `SessionService` `create`, `get`, `items`, `prompt`, `cancel`, `end`, `restart` in `packages/core/src/sessions/service.ts`, refusing agents without first-start confirmation (`agent-not-confirmed`)
- [ ] T046 [US1] Implement approval handling with prompt-always behavior in `packages/core/src/permissions/approvals.ts`: pending requests, `resolveApproval`, cancellation on turn cancel and session end, per data-model.md `ApprovalRequest.outcome`
- [ ] T047 [US1] Implement confined `fs/read_text_file` and `fs/write_text_file` handlers in `packages/core/src/workspace/files.ts`, resolving symlinks and rejecting paths outside `Session.cwd` with `outside-workspace`
- [ ] T048 [US1] Add file snapshots and stale-write detection to `packages/core/src/workspace/snapshots.ts` per data-model.md `FileSnapshot.contentHash`, raising a guard approval before overwriting (FR-079), with tests in `packages/core/tests/integration/stale-write.test.ts`
- [ ] T049 [US1] Detect a deleted, moved, or unreadable working folder in `packages/core/src/workspace/availability.ts`, failing the session with an explanation and blocking further file and command operations, with tests in `packages/core/tests/integration/workspace-gone.test.ts`
- [ ] T050 [US1] Implement login support in `packages/core/src/sessions/auth.ts`: detect error `-32000`, expose `authMethods`, call `authenticate` for agent-type methods, and describe the relaunch command for terminal-type methods (research.md R3)
- [ ] T051 [US1] Implement the login terminal in `apps/desktop/src/main/login-terminal.ts` using `node-pty`, started only for an agent-declared method and reconnecting the session on exit code 0
- [ ] T052 [US1] Add bridge functions `dialogs.pickFolder`, `dialogs.pickAttachments`, `agents.list`, `agents.confirmFirstStart`, `sessions.create`, `sessions.get`, `sessions.items`, `sessions.prompt`, `sessions.cancel`, `sessions.resolveApproval`, `sessions.authMethods`, `sessions.authenticate`, `sessions.restart`, `sessions.end`, `links.open`, `login.terminal.*` with schemas in `apps/desktop/src/shared/bridge.ts` and handlers in `apps/desktop/src/main/handlers/sessions.ts`, using folder and attachment tokens instead of paths
- [ ] T053 [US1] Implement event forwarding with per-frame coalescing of streamed text in `apps/desktop/src/main/event-forwarder.ts` (research.md R18)
- [ ] T054 [P] [US1] Build the new-session dialog (agent, folder, first-start confirmation showing the program and its origin) in `apps/desktop/src/renderer/features/sessions/NewSessionDialog.tsx`, and the statement of what confinement does and does not cover (FR-015)
- [ ] T055 [P] [US1] Build safe Markdown rendering (no raw HTML, no remote images, links as confirm-to-open buttons, copy for text and code blocks) in `apps/desktop/src/renderer/features/conversation/Markdown.tsx`
- [ ] T056 [US1] Build the conversation view with streaming agent messages, distinct reasoning text, notices, and unknown-item placeholders in `apps/desktop/src/renderer/features/conversation/ConversationView.tsx`
- [ ] T057 [US1] Build the composer with send, stop, and attachments gated by agent prompt capabilities in `apps/desktop/src/renderer/features/conversation/Composer.tsx`
- [ ] T058 [P] [US1] Build the approval prompt showing the action and the agent's options in `apps/desktop/src/renderer/features/approvals/ApprovalPrompt.tsx`, showing only one-time options (FR-011), presented as a bar docked above the composer for agent requests and as a blocking dialog for client-guard requests (research.md R20)
- [ ] T059 [P] [US1] Build the error and restart banner and the login-required panel with the embedded login terminal (`xterm.js`) in `apps/desktop/src/renderer/features/sessions/SessionStatus.tsx` and `apps/desktop/src/renderer/features/sessions/LoginPanel.tsx`
- [ ] T060 [US1] Add English and Polish strings for all US1 screens in `apps/desktop/src/renderer/i18n/en.json` and `apps/desktop/src/renderer/i18n/pl.json`

**Checkpoint**: A user can hold a full conversation with an agent, approve requests one by one, stop it, and recover from a crash

---

## Phase 4: User Story 2 - See what the agent is doing (Priority: P2)

**Goal**: Each agent action appears as an item with status and result; file changes appear as comparisons; the plan is shown and kept current; referenced files can be opened

**Independent Test**: Ask the mock agent for `edit-file` and `plan`; the action shows status transitions, the diff shows the path and both versions, the plan updates (quickstart.md, increment 1, rows 3–4)

### Tests for User Story 2

- [ ] T061 [P] [US2] Unit tests for action merging and status ordering in `packages/core/tests/unit/actions.test.ts`
- [ ] T062 [P] [US2] End-to-end flow for US2 in `apps/desktop/tests/e2e/us2-actions.spec.ts`

### Implementation for User Story 2

- [ ] T063 [US2] Implement `tool_call` and `tool_call_update` merging by `toolCallId` in `packages/core/src/sessions/actions.ts` per data-model.md `AgentAction.status`, `AgentAction.kind`, `AgentAction.content`, `AgentAction.locations`
- [ ] T064 [US2] Implement plan handling (latest state replaces earlier) in `packages/core/src/sessions/plan.ts` and wire both into `packages/core/src/sessions/updates.ts`
- [ ] T065 [US2] Add the bridge function `files.openLocation` (indices only) in `apps/desktop/src/main/handlers/files.ts`, opening the file with the system default application after confirming it is inside the workspace or was approved
- [ ] T066 [P] [US2] Build the action card (title, kind, status, result, locations) in `apps/desktop/src/renderer/features/actions/ActionCard.tsx`
- [ ] T067 [P] [US2] Build the diff view using the `diff` package in `apps/desktop/src/renderer/features/diff/DiffView.tsx`
- [ ] T068 [P] [US2] Build the plan view in `apps/desktop/src/renderer/features/plan/PlanView.tsx`
- [ ] T069 [US2] Integrate action, diff, and plan items into `apps/desktop/src/renderer/features/conversation/ConversationView.tsx` and add EN/PL strings

**Checkpoint**: The user can follow and inspect everything the agent does

---

## Phase 5: User Story 3 - Control how much the agent may do without asking (Priority: P3)

**Goal**: Three permission modes, remembered decisions per session, a client-side guard, and a safe default

**Independent Test**: Run the same task under each mode and compare the prompts with the mode's definition (quickstart.md, increment 1, rows 5–7)

### Tests for User Story 3

- [ ] T070 [P] [US3] Table-driven unit tests for the permission engine (every mode × tool kind × option set) in `packages/core/tests/unit/permission-engine.test.ts`, including requests that offer only standing-permission options and requests without an `allow_once` option
- [ ] T071 [P] [US3] Integration tests for rules, automatic approvals recorded as notices, and the guard for paths outside the folder in `packages/core/tests/integration/permissions.test.ts`
- [ ] T072 [P] [US3] End-to-end flow for US3 in `apps/desktop/tests/e2e/us3-permissions.spec.ts`

### Implementation for User Story 3

- [ ] T073 [US3] Implement the permission engine as a pure function and the three built-in modes in `packages/core/src/permissions/engine.ts` and `packages/core/src/permissions/modes.ts` (research.md R13), registered through `PermissionModeDefinition`; the engine never returns an option of kind `allow_always` or `reject_always` and offers the application's own remember choice only in `ask-with-rules`
- [ ] T074 [US3] Implement session rules in `packages/core/src/permissions/rules.ts` per data-model.md `PermissionRule.match`, including list and revoke
- [ ] T075 [US3] Implement the client-side guard in `packages/core/src/permissions/guard.ts`: prompt for `fs/*` paths outside `Session.cwd` (replacing the hard rejection from US1) and expose the hook for `terminal/create` used in US5; guard requests never create rules; implement the one-approval-per-command matching rule and stale-write prompts exactly as defined in research.md R13
- [ ] T076 [US3] Wire the engine into `packages/core/src/permissions/approvals.ts`, recording outcomes decided by rule or mode as notices (FR-014), and implement `setPermissionMode`, `rules`, `revokeRule` in `packages/core/src/sessions/service.ts` with `Session.permissionMode` defaulting to `Settings.defaultPermissionMode`
- [ ] T077 [US3] Add bridge functions `sessions.setPermissionMode`, `sessions.rules`, `sessions.revokeRule` in `apps/desktop/src/main/handlers/sessions.ts`
- [ ] T078 [P] [US3] Build the permission mode selector in `apps/desktop/src/renderer/features/approvals/PermissionModeSelect.tsx` and the default-mode setting in `apps/desktop/src/renderer/features/settings/PermissionSettings.tsx`, repeating the confinement statement from FR-015 in the settings screen
- [ ] T079 [P] [US3] Build the remembered-decisions panel with revoke in `apps/desktop/src/renderer/features/approvals/RulesPanel.tsx`, and add EN/PL strings

**Checkpoint**: First usable version (increment 1): conversation, visibility, and consent control

---

## Phase 6: User Story 4 - Find, install, and add agents (Priority: P4)

**Goal**: List agents found on the machine and in the registry, install with integrity checks after one confirmation, add custom agents, update and remove

**Independent Test**: See a found agent as ready, install a second from the registry, add a third by command, start a session with each (quickstart.md, increment 2, rows 1–6)

### Tests for User Story 4

- [ ] T080 [P] [US4] Unit tests for registry parsing (lenient to unknown keys), platform key resolution including musl, and readiness derivation in `packages/core/tests/unit/registry.test.ts`
- [ ] T081 [P] [US4] Security tests for installation in `packages/core/tests/security/install.test.ts`: checksum mismatch, archive path traversal, `cmd` outside the install directory, non-HTTPS URL, tampered launch file before start
- [ ] T082 [P] [US4] Integration tests for install, update, and remove against a local fixture registry in `packages/core/tests/integration/agents.test.ts`
- [ ] T083 [P] [US4] End-to-end flow for US4 in `apps/desktop/tests/e2e/us4-agents.spec.ts`

### Implementation for User Story 4

- [ ] T084 [P] [US4] Implement the registry client with hourly throttle, ETag, and offline cache in `packages/core/src/agents/registry.ts` per data-model.md `RegistryEntry.distribution` (research.md R5)
- [ ] T085 [P] [US4] Implement platform key resolution in `packages/core/src/agents/platform.ts`
- [ ] T086 [P] [US4] Implement detection of installed agents in `packages/core/src/agents/detect.ts` using the `agentHints` option of `createCore` and the resolved shell environment (research.md R8, R19); load `apps/desktop/resources/agent-hints.json` in `apps/desktop/src/main/core-host.ts` and pass it in
- [ ] T087 [US4] Implement `planInstall` in `packages/core/src/agents/plan.ts`, producing source, size, and verification status (FR-020, FR-077)
- [ ] T088 [US4] Implement the binary installer in `packages/core/src/agents/install-binary.ts`: staged HTTPS download, SHA-256 verification when present, safe extraction, `cmd` validation, per data-model.md `Agent.install`, `Agent.launch`
- [ ] T089 [US4] Implement the managed Node runtime (pinned version, embedded checksums) in `packages/core/src/agents/node-runtime.ts` (research.md R7)
- [ ] T090 [US4] Implement the package installer in `packages/core/src/agents/install-npm.ts` (`npm install --save-exact --ignore-scripts`, per-agent opt-in for scripts, launch through the managed runtime) and `uvx` support when `uv` is present in `packages/core/src/agents/install-uvx.ts` (research.md R6)
- [ ] T091 [US4] Implement launch-hash recording at install and re-check before every start in `packages/core/src/agents/integrity.ts`, surfacing `integrity-failed` (FR-077)
- [ ] T092 [US4] Implement agent icon retrieval in `packages/core/src/agents/icons.ts` (same origin as the registry in effect, size limit, disk cache, placeholder otherwise; research.md R5) and the bridge function `agents.icon` in `apps/desktop/src/main/handlers/agents.ts`, with tests in `packages/core/tests/security/icons.test.ts`
- [ ] T093 [US4] Wire `AgentSource` extensions into agent listing in `packages/core/src/agents/sources.ts`, with a test using a fake source in `packages/core/tests/unit/agent-sources.test.ts` (FR-059)
- [ ] T094 [US4] Complete `AgentService` in `packages/core/src/agents/service.ts`: merged listing with data-model.md `Agent.readiness`, `refreshRegistry`, `install` with progress, update to a new version directory, `remove`, custom agent edit and delete
- [ ] T095 [US4] Add bridge functions `agents.refreshRegistry`, `agents.planInstall`, `agents.install`, `agents.remove`, `agents.saveCustom`, `agents.deleteCustom` and the `install.progress` event in `apps/desktop/src/main/handlers/agents.ts`
- [ ] T096 [P] [US4] Build the agent list with readiness states and registry status in `apps/desktop/src/renderer/features/agents/AgentList.tsx`, showing icons obtained through `agents.icon` or a placeholder
- [ ] T097 [P] [US4] Build the install confirmation dialog (what, from where, verified or not, scripts opt-in) and progress view in `apps/desktop/src/renderer/features/agents/InstallDialog.tsx`
- [ ] T098 [P] [US4] Build the custom agent form in `apps/desktop/src/renderer/features/agents/CustomAgentForm.tsx`, and add EN/PL strings

**Checkpoint**: Any registry agent available for the platform can be installed and used

---

## Phase 7: User Story 5 - Let the agent run commands (Priority: P5)

**Goal**: Agent-requested commands run in the working folder with live output, can be stopped, and never outlive the session

**Independent Test**: Mock scenarios `run-command` and `run-long`: live output for both, the long one stops on request (quickstart.md, increment 2, rows 7–8)

### Tests for User Story 5

- [ ] T099 [P] [US5] Integration tests for `terminal/*` (output, byte limit and truncation, wait, kill, release, cleanup on session end) in `packages/core/tests/integration/commands.test.ts`
- [ ] T100 [P] [US5] End-to-end flow for US5 in `apps/desktop/tests/e2e/us5-commands.spec.ts`

### Implementation for User Story 5

- [ ] T101 [US5] Implement the command runner in `packages/core/src/workspace/commands.ts` per data-model.md `CommandRun.output`, `CommandRun.cwd`, `CommandRun.state` (research.md R4), using the resolved shell environment (research.md R19)
- [ ] T102 [US5] Implement the `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` handlers in `packages/core/src/acp/terminal-handlers.ts`, advertise the `terminal` client capability, and apply the guard from `packages/core/src/permissions/guard.ts`
- [ ] T103 [US5] Emit `command.*` events with control sequences stripped for display, link `terminal` action content to command runs, and implement `killCommand` in `packages/core/src/sessions/service.ts`
- [ ] T104 [US5] Add the bridge function `sessions.killCommand` in `apps/desktop/src/main/handlers/sessions.ts`
- [ ] T105 [US5] Build the command output view (command, live output, truncation note, exit result, stop button) in `apps/desktop/src/renderer/features/terminal/CommandView.tsx`, integrate it into the action card, and add EN/PL strings

**Checkpoint**: Increment 2 complete: agents from the registry can edit files and verify their work

---

## Phase 8: User Story 6 - Work in several sessions and return to earlier ones (Priority: P6)

**Goal**: Concurrent sessions with attention signals, history after restart, resume where supported, rename and delete

**Independent Test**: Two sessions in different folders, restart, both listed and readable, one continued (quickstart.md, increment 3, rows 1–3)

### Tests for User Story 6

- [ ] T106 [P] [US6] Integration tests for concurrent sessions, startup recovery of interrupted runs, resume and load, and deletion in `packages/core/tests/integration/history.test.ts`
- [ ] T107 [P] [US6] End-to-end flow for US6 in `apps/desktop/tests/e2e/us6-sessions.spec.ts`

### Implementation for User Story 6

- [ ] T108 [US6] Implement the session manager for concurrent sessions and startup recovery (sessions left `working` become `ended`, open runs become `interrupted`) in `packages/core/src/sessions/manager.ts`
- [ ] T109 [US6] Implement `list` with filters, `rename`, and `delete` with the run-record choice in `packages/core/src/sessions/service.ts` per data-model.md `Session.lastActivityAt`, `Session.title`
- [ ] T110 [US6] Implement `resume` using `session/resume` or `session/load` gated by agent capabilities in `packages/core/src/sessions/resume.ts` per data-model.md `Session.resumable`, `Session.agentSessionId`
- [ ] T111 [US6] Add bridge functions `sessions.list`, `sessions.resume`, `sessions.rename`, `sessions.delete` in `apps/desktop/src/main/handlers/sessions.ts`
- [ ] T112 [P] [US6] Build the session list with status and attention indicators in `apps/desktop/src/renderer/features/sessions/SessionList.tsx`, as the session board of the mockup: status counts on top and one card per session with status chip, progress, agent, and model
- [ ] T113 [P] [US6] Build the read-only history view with "continue" and "new session in this folder" in `apps/desktop/src/renderer/features/sessions/HistoryView.tsx`
- [ ] T114 [US6] Make the renderer stores multi-session (per-session item caches, paging from the store) in `apps/desktop/src/renderer/app/stores/sessions.ts` and add EN/PL strings

**Checkpoint**: The application supports sustained daily use across tasks and days

---

## Phase 9: User Story 7 - Switch modes and models, and use agent commands (Priority: P7)

**Goal**: Mode, model, and command controls appear only when the agent offers them

**Independent Test**: With mock scenarios `config-options` and `commands`, change each and see the agent acknowledge; with a plain agent the controls are absent (quickstart.md, increment 3, rows 4–5)

### Tests for User Story 7

- [ ] T115 [P] [US7] Integration tests for config options, legacy modes fallback, agent-initiated changes, and available commands in `packages/core/tests/integration/config-options.test.ts`
- [ ] T116 [P] [US7] End-to-end flow for US7 in `apps/desktop/tests/e2e/us7-modes-models.spec.ts`

### Implementation for User Story 7

- [ ] T117 [US7] Implement config option handling (`configOptions`, `config_option_update`, `current_mode_update`, legacy `modes` mapped to one option) in `packages/core/src/sessions/config-options.ts` per data-model.md `Session.configOptions` (research.md R2)
- [ ] T118 [US7] Implement `available_commands_update` handling and `setConfigOption` in `packages/core/src/sessions/service.ts` per data-model.md `Session.availableCommands`
- [ ] T119 [US7] Add the bridge function `sessions.setConfigOption` in `apps/desktop/src/main/handlers/sessions.ts`
- [ ] T120 [P] [US7] Build mode and model selectors that render only for offered categories in `apps/desktop/src/renderer/features/sessions/ConfigOptionSelect.tsx`
- [ ] T121 [P] [US7] Build the slash-command menu in the composer in `apps/desktop/src/renderer/features/conversation/CommandMenu.tsx`, and add EN/PL strings

**Checkpoint**: Agent-specific power features work without agent-specific code

---

## Phase 10: User Story 8 - Use the application in English or Polish (Priority: P8)

**Goal**: Language follows the system on first launch, switches without restart, and both languages are complete

**Independent Test**: Switch the language and walk every screen; no text remains in the other language (quickstart.md, increment 3, row 6)

### Tests for User Story 8

- [ ] T122 [P] [US8] Unit tests for first-launch language selection and fallback in `apps/desktop/tests/language.test.ts`
- [ ] T123 [P] [US8] End-to-end flow for US8 that switches language and scans every screen for untranslated keys in `apps/desktop/tests/e2e/us8-language.spec.ts`, asserting that agent-produced content is left untranslated (FR-037)

### Implementation for User Story 8

- [ ] T124 [US8] Implement language selection from the system locale with English fallback and persistence in `apps/desktop/src/main/language.ts` per data-model.md `Settings.language`
- [ ] T125 [US8] Translate main-process text (menus, native dialogs, confirmations) through the shared resources in `apps/desktop/src/main/i18n.ts`
- [ ] T126 [P] [US8] Build the language setting with live switching in `apps/desktop/src/renderer/features/settings/LanguageSettings.tsx`
- [ ] T127 [US8] Review and complete `apps/desktop/src/renderer/i18n/pl.json` against `en.json`, with plural forms, and make `scripts/check-i18n.mjs` fail on hard-coded strings in `apps/desktop/src/renderer/`

**Checkpoint**: Increment 3 complete

---

## Phase 11: User Story 9 - Adopt the repository as a starting point (Priority: P9)

**Goal**: A stranger gets from clone to running application and to installers for three platforms, and can rebrand and extend from documentation

**Independent Test**: A person new to the repository follows the README from a fresh clone, then triggers a release build and receives three installers (quickstart.md, increment 4, rows 5–7)

### Tests for User Story 9

- [ ] T128 [P] [US9] Test that the brand is single-sourced: changing `apps/desktop/resources/brand.json` changes window title, about text, data directory, and installer name, in `apps/desktop/tests/brand.test.ts`
- [ ] T129 [P] [US9] Run `examples/headless.ts` as an integration test in `packages/core/tests/integration/headless-example.test.ts`

### Implementation for User Story 9

- [ ] T130 [US9] Complete `apps/desktop/electron-builder.yml`: dmg and zip (arm64, x64), NSIS (x64, arm64), AppImage and deb (x64, arm64), names from `brand.json`, documented placeholders for signing credentials; macOS builds are ad hoc signed, with a `codesign --verify` step in `.github/workflows/release.yml`
- [ ] T131 [US9] Create `.github/workflows/release.yml`: on version tag, build on three runners and attach installers to a draft GitHub Release
- [ ] T132 [US9] Add a smoke test of the packaged application (launch, start a mock-agent session, receive a reply) in `apps/desktop/tests/e2e/packaged-smoke.spec.ts`, run for each platform in `.github/workflows/release.yml`
- [ ] T133 [P] [US9] Write `examples/headless.ts` driving the core without a UI (contracts/core-api.md, "Headless use")
- [ ] T134 [P] [US9] Add an example panel extension and the single registration file in `apps/desktop/src/extensions/example-panel/index.tsx` and `apps/desktop/src/extensions/index.ts`, implementing `PanelExtension`
- [ ] T135 [P] [US9] Write `README.md`: what Ster is, prerequisites, clone-to-run steps, how login works, the subscription-terms notice, installing unsigned builds on each platform
- [ ] T136 [P] [US9] Write adopter guides in `docs/`: `rebranding.md`, `adding-a-language.md`, `default-agents.md`, `extensions.md` (panel, agent source, permission mode, policy item, event consumer, each with an example), `signing.md`, `security-model.md`; `security-model.md` states the limits of confinement for agents that use their own tools
- [ ] T137 [US9] Document the extension-contract change policy in `CHANGELOG.md` and add a release checklist in `docs/releasing.md` (FR-062)

**Checkpoint**: The repository is usable as a template by someone who has never seen it

---

## Phase 12: User Story 10 - Apply organization policy (Priority: P10)

**Goal**: One policy, built in or placed on the machine, restricts agents, registry, custom agents, installation, and permission modes, with managed settings visibly marked

**Independent Test**: Place a policy allowing one agent, custom agents off, only always-ask; the application offers exactly that and marks it managed; removing the policy restores unrestricted behavior (quickstart.md, increment 4, rows 1–4)

### Tests for User Story 10

- [ ] T138 [P] [US10] Unit tests for policy validation and per-item merge of built-in and machine sources in `packages/core/tests/unit/policy.test.ts`
- [ ] T139 [P] [US10] Integration tests for enforcement (blocked agent, custom agents off, custom and disabled registry with no request to the public registry, checksum requirement, mode limits, invalid policy blocks sessions) in `packages/core/tests/integration/policy-enforcement.test.ts` and that a policy change takes effect only at the next start (FR-052)
- [ ] T140 [P] [US10] End-to-end flow for US10 in `apps/desktop/tests/e2e/us10-policy.spec.ts`

### Implementation for User Story 10

- [ ] T141 [US10] Implement the `PolicySource` readers in `packages/core/src/policy/sources.ts` (a file source and an in-memory source) and build the two sources in `apps/desktop/src/main/core-host.ts`: built-in `apps/desktop/resources/policy.default.json` and the per-platform machine location derived from `Brand.policyDirName` (research.md R11); the core itself reads no application resources
- [ ] T142 [US10] Implement validation mirroring contracts/policy.schema.json and per-item merge with source tracking in `packages/core/src/policy/validate.ts` and `packages/core/src/policy/merge.ts` per data-model.md `OrganizationPolicy.permissions.default`, `OrganizationPolicy.registry.url`, `OrganizationPolicy.agents.allow`, `OrganizationPolicy.registry.mode`
- [ ] T143 [US10] Enforce agent items in `packages/core/src/agents/service.ts`: `OrganizationPolicy.agents.allow` and `OrganizationPolicy.agents.customAllowed` produce readiness `blocked-by-policy` and refuse start
- [ ] T144 [US10] Enforce registry and install items in `packages/core/src/agents/registry.ts` and `packages/core/src/agents/plan.ts`: `OrganizationPolicy.registry.mode`, `OrganizationPolicy.install.requireChecksum`, `OrganizationPolicy.install.allowInstallScripts` (FR-046, FR-078); with `custom` or `disabled`, no request of any kind (index or icons) reaches the public registry
- [ ] T145 [US10] Enforce permission items in `packages/core/src/permissions/modes.ts` and `packages/core/src/sessions/service.ts`: `OrganizationPolicy.permissions.modes`, `OrganizationPolicy.permissions.default`
- [ ] T146 [US10] Refuse session creation with `policy-invalid` when the policy state is invalid, keeping history readable, in `packages/core/src/sessions/service.ts`; expose managed markers through `SettingsService` and `app.info`
- [ ] T147 [US10] Wire `PolicyItemDefinition` extensions into validation and enforcement in `packages/core/src/policy/extensions.ts`, rejecting any item that would loosen a restriction, with tests in `packages/core/tests/unit/policy-extensions.test.ts` (FR-059)
- [ ] T148 [P] [US10] Build managed-setting markers and locked controls in `apps/desktop/src/renderer/components/ManagedBadge.tsx` and apply them in settings, the agent list, and the permission mode selector
- [ ] T149 [P] [US10] Build the invalid-policy screen and blocked-agent states in `apps/desktop/src/renderer/features/policy/PolicyStatus.tsx`, and add EN/PL strings
- [ ] T150 [P] [US10] Write `docs/organization-policy.md`: every item, both delivery routes, file locations per platform, and a complete example for a company with a fixed agent set (FR-053)

**Checkpoint**: Increment 4 complete: the application can be rolled out inside an organization

---

## Phase 13: User Story 11 - Define the factory in the repository (Priority: P11)

**Goal**: A versioned definition in the project sets agents, default mode, task templates, and judging criteria, applied only after the user trusts it and never above policy

**Independent Test**: Add `.ster/factory.yaml`, start a session, confirm nothing applies before trust and everything declared applies after (quickstart.md, increment 5, rows 1–5)

### Tests for User Story 11

- [ ] T151 [P] [US11] Unit tests for definition lookup (nearest ancestor), validation, and template rendering in `packages/core/tests/unit/factory.test.ts`
- [ ] T152 [P] [US11] Security tests with hostile definitions in `packages/core/tests/security/factory-definition.test.ts`: untrusted definition has no effect, changed content resets trust, policy cannot be loosened, command-declared agent needs confirmation, template inputs are not evaluated (SC-018)
- [ ] T153 [P] [US11] End-to-end flow for US11 in `apps/desktop/tests/e2e/us11-factory.spec.ts`

### Implementation for User Story 11

- [ ] T154 [P] [US11] Implement lookup and YAML parsing with validation mirroring contracts/factory.schema.json in `packages/core/src/factory/definition.ts` per data-model.md `FactoryDefinition.agents`, `FactoryDefinition.templates`, `FactoryDefinition.judging`
- [ ] T155 [P] [US11] Implement folder trust in `packages/core/src/factory/trust.ts` per data-model.md `FolderTrust.folder`, `FolderTrust.contentHash`, including the change summary against the trusted version
- [ ] T156 [US11] Implement application of a trusted definition at session creation in `packages/core/src/factory/apply.ts`: preselect agent and mode, filter through policy, report dropped parts, and route command-declared agents through first-start confirmation; record `Session.factoryDefinitionHash`
- [ ] T157 [US11] Implement plain-text template rendering and `FactoryService` in `packages/core/src/factory/service.ts`
- [ ] T158 [US11] Add bridge functions `factory.find`, `factory.trust`, `factory.revoke`, `factory.renderTemplate` in `apps/desktop/src/main/handlers/factory.ts`
- [ ] T159 [P] [US11] Build the trust dialog showing what the definition would change, and the changed-definition prompt, in `apps/desktop/src/renderer/features/factory/TrustDialog.tsx`
- [ ] T160 [P] [US11] Build the task template picker with input blanks in `apps/desktop/src/renderer/features/factory/TemplatePicker.tsx`, and add EN/PL strings
- [ ] T161 [P] [US11] Write `docs/factory-definition.md` with every item and a complete example file (FR-069)

**Checkpoint**: A team shares one reviewed agent setup through its repository

---

## Phase 14: User Story 12 - Keep a record of every run and judge its quality (Priority: P12)

**Goal**: Every turn leaves a complete run record that can be browsed, filtered, rated, judged by an agent, exported, and deleted

**Independent Test**: Complete three tasks with two agents; find all three, rate one, have one judged, export them, and compare the export with the screen (quickstart.md, increment 5, rows 6–9)

### Tests for User Story 12

- [ ] T162 [P] [US12] Integration tests that every turn (completed, cancelled, failed, interrupted) yields exactly one complete record in `packages/core/tests/integration/run-records.test.ts` (SC-019)
- [ ] T163 [P] [US12] Unit tests for filters and totals, and a test validating exported lines against contracts/run-record.schema.json, in `packages/core/tests/unit/runs.test.ts`
- [ ] T164 [P] [US12] Integration tests for judging (separate session, no file writes, no commands, score stored with judge identity) in `packages/core/tests/integration/judging.test.ts`, including a judging agent blocked by policy
- [ ] T165 [P] [US12] End-to-end flow for US12 in `apps/desktop/tests/e2e/us12-runs.spec.ts`

### Implementation for User Story 12

- [ ] T166 [US12] Extend the run lifecycle in `packages/core/src/runs/lifecycle.ts` to capture the full record per data-model.md `RunRecord.request`, `RunRecord.agent`, `RunRecord.actions`, `RunRecord.approvals`, `RunRecord.commands`, `RunRecord.outcome`, and `RunRecord.usage` from `usage_update` (unknown when not reported)
- [ ] T167 [US12] Implement `RunService.list` with filters and totals, `get`, and `delete` in `packages/core/src/runs/service.ts`, and the keep-without-text path used by session deletion; user rating and agent score are separate filters and separate totals (FR-071)
- [ ] T168 [P] [US12] Implement scores and user rating in `packages/core/src/runs/scores.ts` per data-model.md `Score.value`, `Score.scale`, `Score.source`
- [ ] T169 [US12] Implement on-demand judging in `packages/core/src/runs/judge.ts`: separate hidden session with reduced client capabilities, read-only permission handling, criteria from the trusted factory definition, lenient parsing of the JSON result (research.md R15); refuse a judging agent that organization policy does not allow (`blocked-by-policy`, FR-074); store per data-model.md `Score.judge`, `Score.scale`, and mark the run `RunRecord.kind` = `judging`
- [ ] T170 [P] [US12] Implement JSON Lines export in `packages/core/src/runs/export.ts` conforming to contracts/run-record.schema.json
- [ ] T171 [US12] Add bridge functions `runs.list`, `runs.get`, `runs.rate`, `runs.judge`, `runs.export` (native save dialog), `runs.delete` in `apps/desktop/src/main/handlers/runs.ts`
- [ ] T172 [P] [US12] Build the runs view with filters and totals in `apps/desktop/src/renderer/features/runs/RunsView.tsx`
- [ ] T173 [P] [US12] Build the run detail with rating, judge action, and scores in `apps/desktop/src/renderer/features/runs/RunDetail.tsx`, and add EN/PL strings
- [ ] T174 [P] [US12] Write `docs/run-records.md` describing the export format and how a third-party tool reads it (SC-021)

**Checkpoint**: Increment 5 complete: the local foundations of the software factory are in place

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Qualities that span stories

- [ ] T175 [P] Complete the hostile-content suite for agent output (script injection, remote resources, oversized and malformed updates, control sequences) in `packages/core/tests/security/agent-content.test.ts` and `apps/desktop/tests/e2e/hostile-content.spec.ts` (SC-016)
- [ ] T176 [P] Add hostile-renderer tests for every bridge function added since phase 2 in `apps/desktop/tests/bridge.test.ts`
- [ ] T177 [P] Add a network allow-list test in `apps/desktop/tests/e2e/network.spec.ts`: across the US1, US4, and US10 flows the application contacts only the registry in effect and confirmed download hosts, and nothing when the registry is disabled (FR-042, FR-046, SC-012)
- [ ] T178 Virtualise the conversation list with TanStack Virtual and add a performance test with 1,000 items and 5 concurrent sessions in `apps/desktop/src/renderer/features/conversation/ConversationView.tsx` and `apps/desktop/tests/e2e/performance.spec.ts` (SC-002, SC-006, SC-008)
- [ ] T179 [P] Keyboard and contrast pass over all main flows, with fixes, recorded in `docs/accessibility.md`
- [ ] T180 [P] Review every public function and extension contract in `packages/core/src/` for documentation comments (Constitution VII)
- [ ] T181 Remove dead code and unexplained TODOs, confirm coverage of `packages/core` is at least 80%, and confirm `pnpm audit --audit-level high` is clean
- [ ] T182 Run all manual validation tables in `specs/001-acp-desktop-client/quickstart.md` on macOS, Windows, and Linux and record results in `docs/releasing.md`
- [ ] T183 Run the reference task with three real registry agents of different distribution types and record results in the release notes in `CHANGELOG.md` (SC-003)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; blocks all user stories
- **User stories (Phases 3–14)**: all depend on Foundational; see the table below
- **Polish (Phase 15)**: depends on the stories being shipped

### User Story Dependencies

| Story | Depends on | Notes |
|---|---|---|
| US1 | Foundational | MVP |
| US2 | US1 | renders actions inside the US1 conversation |
| US3 | US1 | replaces the prompt-always approval path |
| US4 | US1 | independent of US2 and US3 |
| US5 | US1, US3 | needs the guard hook from US3; action card integration needs US2 |
| US6 | US1 | independent of US2–US5 |
| US7 | US1 | independent of US2–US6 |
| US8 | Foundational | can run alongside any story; final Polish translation pass needs the other stories' strings |
| US9 | US1 | documentation of extension points is complete only after the stories that add them |
| US10 | US3, US4 | enforces limits on agents, installs, and modes |
| US11 | US3, US4, US10 | definition is filtered through policy |
| US12 | US1, US2, US5 | judging criteria come from US11; rating, list, and export work without it |

### Within Each User Story

- Tests first, failing, then implementation
- Models before services, services before bridge handlers, handlers before screens
- EN and PL strings in the same change as the screen that uses them
- The story's end-to-end flow passes before the checkpoint

### Parallel Opportunities

- Phase 1: all tasks marked [P] after the workspace root exists
- Phase 2: brand, errors, logger, event stream, extension contracts, policy stub, settings, i18n, and fuses are independent files
- After US1: US2, US3, US4, US6, US7, and US8 can proceed in parallel by different people
- Within a story: tests marked [P] together; renderer components marked [P] together once their bridge functions exist

---

## Parallel Example: User Story 1

```text
# Tests for US1 together:
packages/core/tests/integration/session-turn.test.ts
packages/core/tests/integration/auth.test.ts
packages/core/tests/security/workspace-paths.test.ts
apps/desktop/tests/e2e/us1-conversation.spec.ts

# Models for US1 together:
packages/core/src/agents/agent.ts
packages/core/src/sessions/session.ts
packages/core/src/sessions/items.ts

# Renderer components for US1 together, once the bridge functions exist:
apps/desktop/src/renderer/features/sessions/NewSessionDialog.tsx
apps/desktop/src/renderer/features/conversation/Markdown.tsx
apps/desktop/src/renderer/features/approvals/ApprovalPrompt.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **Stop and validate**: quickstart.md, increment 1, rows 1, 2, 8, 10
5. Demonstrate with the mock agent and one real agent

### Incremental Delivery

1. Setup + Foundational → hardened empty shell, headless core, green CI
2. US1 → MVP; US2 + US3 → **first usable version** (increment 1)
3. US4 + US5 → real agents from the registry doing real work (increment 2)
4. US6 + US7 + US8 → sustained daily use (increment 3)
5. US9 + US10 → template release and organizational rollout (increment 4)
6. US11 + US12 → factory foundations (increment 5)
7. Polish → release

Each increment is tagged and can be released as installers once US9's release workflow exists; before that, increments are validated from source.

### Parallel Team Strategy

1. The whole team completes Setup and Foundational together
2. One developer delivers US1; meanwhile another extends the mock agent scenarios and writes the end-to-end harness
3. After US1: developer A takes US2 then US5, developer B takes US3 then US10, developer C takes US4, developer D takes US6, US7, US8
4. US9 documentation is written continuously and closed in increment 4

---

## Notes

- [P] tasks touch different files and have no dependency on an unfinished task
- Every task that adds a screen also adds its EN and PL strings; `pnpm check` fails otherwise
- Every task that adds an untrusted input (agent message type, registry field, policy item, definition item, bridge function) adds a security test in the same change (Constitution VI)
- Core code never imports from `apps/desktop`; the lint rule from Phase 1 enforces it
- Commit after each task or logical group; stop at any checkpoint to validate the story on its own
