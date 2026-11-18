# Contract: Bridge between Renderer and Main Process

**Where**: `apps/desktop/src/preload` exposes `window.ster`; schemas live in
`apps/desktop/src/shared`; handlers live in `apps/desktop/src/main`.

## Rules (Constitution III and VI)

1. The preload script exposes exactly the functions listed here. There is no generic
   `invoke(channel, …)` and no access to `ipcRenderer` from the page.
2. Every request payload is validated with its zod schema in the main process before use.
   Invalid payloads are rejected with `invalid-argument` and logged.
3. The renderer never sends a file system path, command line, or URL to be acted on.
   It sends identifiers issued by the main process (`sessionId`, `agentId`, `approvalId`,
   `itemSeq`, `locationIndex`, `linkIndex`). Paths enter only through native dialogs opened
   by the main process.
4. Handlers check the sender frame is the application's own top-level frame.
5. Responses and events carry display data only; they never include credentials or the
   environment of agent processes.
6. Errors cross the bridge as `{ code, details? }` (codes from
   [core-api.md](./core-api.md)); the renderer translates them.

## Requests (renderer → main, promise-based)

| Function | Payload | Result | Requirement |
|---|---|---|---|
| `app.info()` | — | brand, version, platform, language, policy state | FR-043, FR-049 |
| `settings.get()` / `settings.set(patch)` | partial settings | settings + managed markers | FR-036, FR-049 |
| `agents.list()` | — | agents with readiness | FR-018–FR-024 |
| `agents.icon(agentId)` | id | data URL or none | FR-046 |
| `agents.refreshRegistry()` | — | registry status | FR-019, FR-022 |
| `agents.planInstall(agentId)` | id | install plan (source, size, verified?) | FR-020, FR-056 |
| `agents.install(planId)` | plan id | agent | FR-020 |
| `agents.remove(agentId)` | id | — | FR-020 |
| `agents.saveCustom(input)` / `agents.deleteCustom(agentId)` | name, command, args, env | agent | FR-021 |
| `agents.confirmFirstStart(agentId)` | id | — | FR-058 |
| `dialogs.pickFolder()` | — | `{ folderToken, displayPath }` or cancelled | FR-001 |
| `sessions.create({ agentId, folderToken, permissionMode? })` | | session | FR-001 |
| `sessions.list(filter?)` / `sessions.get(id)` | | summaries / session | FR-028, FR-030 |
| `sessions.items(id, page)` | paging | conversation items | FR-030 |
| `sessions.prompt(id, content)` | text + attachment tokens | accepted | FR-001–FR-004 |
| `dialogs.pickAttachments(sessionId)` | — | attachment tokens | FR-004 |
| `sessions.cancel(id)` | | — | FR-003 |
| `sessions.resolveApproval(approvalId, outcome)` | option id or cancel | — | FR-011 |
| `sessions.setPermissionMode(id, mode)` | | — | FR-012, FR-013 |
| `sessions.setConfigOption(id, configId, value)` | | — | FR-033, FR-034 |
| `sessions.rules(id)` / `sessions.revokeRule(ruleId)` | | rules | FR-014 |
| `sessions.killCommand(commandRunId)` | | — | FR-026 |
| `sessions.authMethods(id)` / `sessions.authenticate(id, methodId)` | | methods / — | FR-017 |
| `sessions.resume(id)` / `restart(id)` / `rename(id, title)` / `end(id)` / `delete(id, opts)` | | | FR-006, FR-031, FR-032 |
| `files.openLocation(sessionId, itemSeq, locationIndex)` | indices | — | FR-010 |
| `links.open(sessionId, itemSeq, linkIndex)` | indices | — (after native confirmation) | FR-055 |
| `factory.find(sessionOrFolderToken)` | | lookup, trust state, change summary | FR-063, FR-064 |
| `factory.trust(folderToken, contentHash)` / `factory.revoke(folderToken)` | | — | FR-064 |
| `factory.renderTemplate(sessionId, templateId, inputs)` | | text | FR-067 |
| `runs.list(filter, page)` / `runs.get(id)` | | runs + totals | FR-070, FR-071 |
| `runs.rate(id, rating)` / `runs.judge(id, agentId)` | | score | FR-072, FR-073 |
| `runs.export(filter)` | filter | `{ count }` after native save dialog | FR-075 |
| `runs.delete(filterOrIds)` | | `{ count }` | FR-076 |
| `login.terminal.start(sessionId, methodId)` | | `{ terminalToken }` | FR-017 |
| `login.terminal.input(terminalToken, data)` / `resize(terminalToken, cols, rows)` | | — | FR-017 |

Notes:

- `folderToken` and attachment tokens are single-purpose handles created by the main
  process for paths the user picked in a native dialog; they expire with the window.
- `files.openLocation` and `links.open` take indices into data the main process already
  holds, so the page cannot ask to open an arbitrary path or URL.
- `login.terminal.*` is the only interactive terminal; it runs only the agent's declared
  login command, shown to the user before start.

## Events (main → renderer)

One subscription function: `events.subscribe(listener)`. The main process forwards core
events ([core-api.md](./core-api.md), "Session events") filtered to display data, with
streamed text coalesced to at most one update per animation frame per session, plus:

| Event | Payload |
|---|---|
| `login.terminal.data` | `{ terminalToken, data }` |
| `login.terminal.exit` | `{ terminalToken, exitCode }` |
| `install.progress` | `{ planId, phase, received?, total? }` |
| `policy.changed` | effective policy (only at start in this version) |

## Test obligations

- A schema test per request: valid payload passes, each invalid variant is rejected.
- A test that the preload surface equals this list (no extra functions).
- Hostile-renderer tests: path strings where tokens are expected, unknown ids, oversized
  payloads, and calls from a non-top-level frame are all rejected.
