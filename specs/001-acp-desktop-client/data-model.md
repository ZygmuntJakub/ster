# Data Model: Ster — ACP Desktop Client

**Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All identifiers are opaque strings issued by the core (UUID v7 unless noted). Times are
ISO 8601 UTC. "Stored" means persisted in the local database; "derived" means computed at
runtime. Field names are the logical model; table layout is an implementation detail of
the `Store`.

## Agent

A program the application can start.

| Field | Type | Notes |
|---|---|---|
| `id` | string | registry id, or `custom:<uuid>` |
| `name` | string | display name |
| `origin` | `registry` \| `detected` \| `custom` | |
| `version` | string? | from registry or reported by `agentInfo` |
| `launch` | `{ command, args[], env{} }` | resolved absolute command for installed agents |
| `distribution` | `binary` \| `npx` \| `uvx` \| `none` | `none` for detected and custom |
| `install` | `{ path, installedAt, launchHash, verified: 'registry' \| 'first-use', scriptsAllowed }`? | present for application-installed agents |
| `confirmedAt` | time? | first-start confirmation (FR-058); cleared when `launch` changes |
| `readiness` | derived: `ready` \| `needs-login` \| `not-installed` \| `unavailable` \| `blocked-by-policy` \| `update-available` \| `integrity-failed` | |
| `capabilities` | derived after `initialize` | cached per version for UI gating |

Rules: `launch.command` for `binary` must resolve inside `install.path`. A `custom` agent
exists only while policy allows custom agents; when disallowed it is kept but unstartable.
`launchHash` is re-checked before every start; mismatch → `integrity-failed`.

## RegistryEntry (cached, not authoritative)

`id`, `name`, `version`, `description`, `repository?`, `website?`, `authors[]`, `license?`,
`license_url?`, `icon?`, `distribution { binary?: Record<PlatformKey, { archive, cmd,
args[]?, env{}?, sha256? }>, npx?: { package, args[]?, env{}? }, uvx?: {…} }`. Unknown
fields are ignored. The cache stores the fetch time, source URL, and ETag.

## Session

One conversation between the user and one agent in one working folder.

| Field | Type | Notes |
|---|---|---|
| `id` | string | local id |
| `agentSessionId` | string? | id issued by the agent; needed to resume |
| `agentId`, `agentVersion` | string | snapshot at creation |
| `cwd` | absolute path | must exist and be a directory at start |
| `title` | string | user-set, else agent `session_info_update`, else first request |
| `status` | see state machine | |
| `permissionMode` | `always-ask` \| `ask-with-rules` \| `auto-approve-reads` \| extension id | limited by policy |
| `configOptions` | list of `{ id, category, currentValue, choices[] }` | modes, models; from agent |
| `availableCommands` | list of `{ name, description, inputHint? }` | from agent |
| `factoryDefinitionHash` | string? | definition applied at start, if any |
| `createdAt`, `lastActivityAt` | time | |
| `resumable` | derived | agent advertises resume or load, and policy allows the agent |

**State machine**

```text
starting ──initialize ok──▶ idle ──prompt──▶ working ──stop──▶ idle
   │                          │                 │  ▲
   │ auth error               │ close           │  └─ approval resolved
   ▼                          ▼                 ▼
needs-login ──login ok──▶ starting        waiting-approval
   any state ──agent exit / protocol error──▶ failed ──restart──▶ starting
   idle | failed ──user ends or app quits──▶ ended
```

`ended` and `failed` sessions remain readable. A session in `working` or
`waiting-approval` at application quit becomes `ended`, and its open run becomes
`interrupted`.

## ConversationItem

Ordered by (`sessionId`, `seq`). Append-only except for in-place updates of the open
streaming item and of actions.

| `kind` | Payload |
|---|---|
| `user-message` | content blocks (text, file references, images) |
| `agent-message` | accumulated Markdown text |
| `agent-thought` | accumulated text |
| `action` | see AgentAction |
| `plan` | entries `{ content, priority, status }`; latest state replaces earlier |
| `approval` | see ApprovalRequest |
| `command-run` | see CommandRun |
| `notice` | system messages: errors, login required, policy notes, auto-approvals |
| `unknown` | raw update kept for forward compatibility, shown as placeholder |

Every item carries `runId` (the turn it belongs to) and `createdAt`.

## FileSnapshot (per session, in memory and stored)

`sessionId`, `path` (real path), `contentHash`, `at`. Written whenever the agent reads or
writes a file through the application; compared before each write (FR-079).

## AgentAction

`toolCallId`, `title`, `toolName?`, `kind` (`read` \| `edit` \| `delete` \| `move` \|
`search` \| `execute` \| `think` \| `fetch` \| `switch_mode` \| `other`), `status`
(`pending` → `in_progress` → `completed` \| `failed`), `locations[] { path, line? }`,
`content[]` of `text` \| `diff { path, oldText?, newText }` \| `terminal { commandRunId }`.
Updates merge by `toolCallId`; status never moves backwards. Text sizes are capped for
display; the full value stays in storage.

## ApprovalRequest

`id`, `sessionId`, `runId`, `toolCallId?`, `source` (`agent` \| `client-guard`),
`subject` (action title, kind, locations or command), `options[] { optionId, name, kind }`,
`outcome`: `{ by: 'user', optionId }` \| `{ by: 'rule', ruleId, optionId }` \|
`{ by: 'mode', optionId }` \| `{ by: 'cancelled' }`, `requestedAt`, `resolvedAt`.

`options` holds only one-time options (`allow_once`, `reject_once`); standing-permission
options sent by an agent are dropped on receipt. `source: client-guard` covers paths
outside the working folder, commands without a matching approval, and stale writes.

A pending request is cancelled when the turn is cancelled, the session ends, or the
application quits. An outcome `by: 'rule'` or `by: 'mode'` is always written to the
conversation as a notice (FR-014).

## PermissionRule

`id`, `sessionId`, `match { kind, toolName? }`, `decision: 'allow'`, `createdAt`. Scoped to
one session; deleted with it; revocable individually. Never created for `client-guard`
requests about paths outside the working folder.

## CommandRun

`id`, `sessionId`, `runId`, `terminalId`, `command`, `args[]`, `cwd`, `startedAt`,
`endedAt?`, `exit { code?, signal? }`, `output` (ring buffer, byte-limited),
`truncated: boolean`, `state` (`running` \| `exited` \| `killed` \| `released`).
`cwd` must be inside the session folder unless approved through the guard.

## OrganizationPolicy (read-only at runtime)

Effective policy = built-in defaults overlaid by machine policy, per item. See
[contracts/policy.schema.json](./contracts/policy.schema.json).

| Item | Type | Unset means |
|---|---|---|
| `agents.allow` | list of agent ids | all allowed |
| `agents.customAllowed` | boolean | true |
| `registry.mode` | `public` \| `custom` \| `disabled` | `public` |
| `registry.url` | https URL | required when `custom` |
| `install.requireChecksum` | boolean | false |
| `install.allowInstallScripts` | boolean | true (user may opt in per agent) |
| `permissions.modes` | list of mode ids | all |
| `permissions.default` | mode id | `always-ask`; must be in `modes` |

Derived: `state` (`absent` \| `valid` \| `invalid`), `sources[]`, and for each item which
source set it (drives the "managed by your organization" marker). `invalid` blocks new
sessions.

## FactoryDefinition and FolderTrust

Definition (from `.ster/factory.yaml`, see
[contracts/factory.schema.json](./contracts/factory.schema.json)): `version`, `agents[]`
(`{ id }` or `{ name, command, args[], env{} }`), `defaultAgent?`, `permissionMode?`,
`templates[] { id, title, prompt, inputs[] { name, label, default? } }`,
`judging? { criteria[] { id, description, weight? }, scale }`.

FolderTrust (stored): `folder` (absolute, real path), `definitionPath`, `contentHash`,
`trustedAt`. Derived trust state: `untrusted` (no row), `trusted` (hash matches), `changed`
(row exists, hash differs). Only `trusted` definitions are applied. Applied values are
then filtered by policy; dropped parts are reported.

## RunRecord

One per prompt turn. See [contracts/run-record.schema.json](./contracts/run-record.schema.json).

| Field | Notes |
|---|---|
| `id`, `sessionId` | `sessionId` kept even if the conversation text is deleted |
| `kind` | `task` \| `judging` |
| `request` | text of the user's message; `null` when the conversation was deleted with "keep records without text" |
| `agent { id, name, version }`, `model?`, `mode?`, `permissionMode` | snapshot at start |
| `cwd`, `factoryDefinitionHash?`, `templateId?` | |
| `startedAt`, `endedAt?`, `durationMs?` | |
| `outcome` | `completed` \| `cancelled` \| `failed` \| `interrupted`; plus `stopReason?`, `error?` |
| `actions[]` | `{ toolCallId, kind, title, status, locations[] }` (no file content) |
| `approvals[]` | `{ subject, decidedBy, optionKind }` |
| `commands[]` | `{ command, exitCode?, durationMs? }` |
| `usage?` | `{ contextUsed?, contextSize?, cost? { amount, currency } }`; absent = unknown |
| `scores[]` | see Score |

A run is created when the prompt is sent and finalised when it stops. A run without
`endedAt` found at startup is finalised as `interrupted`.

## Score

`id`, `runId`, `source` (`user` \| `agent`), `value`, `scale { min, max }` (1–5 for user
ratings, the factory definition's scale for agent scores; values from different sources
are never compared or combined), `note?` (user) or `reasoning` + `criteria[] { id, value }` (agent),
`judge? { agentId, version, model?, judgingRunId }`, `createdAt`, `updatedAt`. At most one
`user` score per run (editable); any number of `agent` scores.

## Settings

`language` (`en` \| `pl` \| extension), `defaultPermissionMode`, `defaultAgentId?`,
`customAgents[]`, `theme` (`system` \| `light` \| `dark`). Values controlled by policy are
read from policy and cannot be written.

## Brand (build-time, `resources/brand.json`)

`productName`, `appId`, `dataDirName`, `policyDirName`, `icon`, `colors`. The single place
for FR-043; read by main, renderer, and the installer configuration.

## Relationships

```text
Agent 1 ── * Session 1 ── * ConversationItem
                    1 ── * RunRecord 1 ── * Score
                    1 ── * PermissionRule
                    1 ── * CommandRun
RunRecord 1 ── * ApprovalRequest, AgentAction (by runId)
FolderTrust * ── 1 folder ;  Session * ── 0..1 FactoryDefinition (by hash)
```

Deleting a session deletes its items, rules, command runs, and approvals; run records are
deleted or kept without text according to the user's choice (US12, scenario 7).

## Validation rules from requirements

- Paths received from an agent are resolved through symlinks before any check (FR-015).
- Agent ids from registry and policy match `^[a-z][a-z0-9-]*$`.
- `registry.url` and every download URL must be `https:`.
- Binary `cmd` must start with `./` and must not contain `..` (R6).
- A policy whose `permissions.default` is not in `permissions.modes` is invalid (edge case).
- Factory template inputs are substituted as plain text; no expression evaluation.
