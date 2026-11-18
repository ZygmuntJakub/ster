# Research: Ster — ACP Desktop Client

**Date**: 2026-11-18 | **Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Facts marked **[verified]** were read on 2026-11-18 from the published SDK package
(`@agentclientprotocol/sdk@2.8.0` type definitions and bundled schema), the live registry
index, the registry repository, the agent adapter packages, and Zed's source. Items marked
**[to verify]** are assumptions that the first implementation tasks must confirm.

## R1. ACP SDK and connection model

- **Decision**: Use `@agentclientprotocol/sdk` 2.x, stable entrypoint only. Build the
  connection with `client({ name }).onRequest(...).onNotification(...).connect(stream)`,
  where `stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))`.
  Process `session/update` through a per-session serial queue.
- **Rationale**: [verified] The older `ClientSideConnection` API is removed; the "app" API
  is current. Streams are Web Streams, so Node streams must be converted. Notification
  handlers run concurrently, so ordering must be enforced by the client.
- **Alternatives considered**: `/unstable` entrypoint (adds fork, archive, per-turn token
  usage) — rejected for v1: unstable surface in a template others copy. Hand-written
  JSON-RPC — rejected by Constitution I.

## R2. Mapping spec features to protocol v1

| Spec feature | Protocol mechanism [verified] | Gate |
|---|---|---|
| Streaming reply, reasoning | `session/update`: `agent_message_chunk`, `agent_thought_chunk` | always |
| Cancel | `session/cancel` notification; prompt resolves `cancelled` | always |
| Actions, diffs, locations | `tool_call`, `tool_call_update`; content `content` / `diff` / `terminal` | always |
| Plan | `plan` update | always |
| Approvals | `session/request_permission` with option kinds `allow_once`, `allow_always`, `reject_once`, `reject_always` | always |
| Modes and models | `configOptions` + `session/set_config_option` (categories `mode`, `model`, `thought_level`); legacy `modes` + `session/set_mode` as fallback | agent returns them |
| Slash commands | `available_commands_update`; invoked as prompt text | agent sends it |
| Session title | `session_info_update` | agent sends it |
| Usage and cost | `usage_update` (`used`, `size`, `cost {amount, currency}`) | agent sends it |
| Resume | `session/resume`, else `session/load` (replays history) | `sessionCapabilities.resume` / `loadSession` |
| Files for the agent | `fs/read_text_file`, `fs/write_text_file` | client capability |
| Commands for the agent | `terminal/create`, `output`, `wait_for_exit`, `kill`, `release` | client capability |

- **Decision**: Model selection is implemented only through config options; there is no
  `session/set_model` method in the schema. The application's own stored conversation is
  the source for reading history; `session/resume` or `session/load` is used only to
  continue.
- **Not advertised in v1**: `elicitation` capability (agent-initiated forms/URLs) and
  `session.compaction` / `notices`. Unknown update variants are stored and shown as a
  neutral placeholder (spec edge case).

## R3. Authentication (subscription login)

- **Decision**: Advertise `clientCapabilities.auth.terminal: true`. Support both method
  types: `agent` (call `authenticate {methodId}`; the agent opens the browser itself) and
  `terminal` (relaunch the agent command with the method's `args`/`env` in an interactive
  terminal inside the application; exit code 0 means success; then reconnect). Detect
  "login required" by JSON-RPC error `-32000`.
- **Rationale**: [verified] `claude-agent-acp` offers only `terminal` methods and only when
  the client advertises terminal auth; otherwise it reports no methods. `codex-acp` offers
  `agent`-type methods including ChatGPT browser login. An existing CLI login on the
  machine is reused by the Claude adapter.
- **Consequence**: an interactive pseudo-terminal is required for login only. Use
  `node-pty` with `xterm.js`, started only by a user action that shows the exact command.
  This is the single native dependency; see Complexity Tracking in the plan.
- **[verified 2026-11-18, T012]**: `node-pty@1.1.0` ships prebuilt `pty.node` (and helpers)
  for `darwin-arm64`, `darwin-x64`, `win32-arm64`, and `win32-x64`. It does **not** ship
  Linux prebuilds (`linux-x64` / `linux-arm64`); install falls through to `node-gyp rebuild`
  when `prebuilds/<platform>-<arch>` is missing. Keep `node-pty`; CI Linux images must have
  build tools so the native addon compiles. If the login terminal still cannot start on a
  given machine, show the documented “run the vendor CLI in your own terminal” fallback.
- **Alternatives considered**: telling the user to run the vendor CLI in their own
  terminal — kept as the documented fallback and the message shown if the login terminal
  cannot start; opening the system terminal application — rejected, differs per platform
  and desktop environment.

## R4. Agent-requested commands (`terminal/*`)

- **Decision**: Implement with `child_process.spawn` (no PTY), in the session's working
  folder, capturing combined output into a ring buffer honoring `outputByteLimit` (default
  cap 1 MiB), reporting `truncated`. Strip control sequences before display. Kill the
  whole process tree on `terminal/kill`, session end, and application quit.
- **Rationale**: [verified] The schema has no PTY, stdin, or resize fields; the docs tell
  clients to neutralise control sequences.

## R5. Registry consumption

- **Decision**: Fetch `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`
  (or the URL from organization policy), at most hourly, with a disk cache used when
  offline. Parse leniently with a zod schema that ignores unknown keys. Support `binary`
  and `npx` distributions; support `uvx` only when `uv` is found on the machine, otherwise
  list the agent as "requires uv".
- **Rationale**: [verified] The live index contains keys the published JSON Schema forbids
  (`extensions`), so strict validation would break. 46 agents: 20 npx-only, 21 binary-only,
  3 both, 2 uvx-only. The index is static JSON with open CORS, so an organization can host
  a copy in the same format (spec assumption confirmed).
- **Platform keys**: `darwin|linux|windows` × `aarch64|x86_64`, plus `-musl` on Linux. On a
  musl host without a `-musl` entry the binary is unavailable (no fallback).

- **Decision (icons)**: agent icons are fetched by the main process, only from the same
  origin as the registry index in effect, cached on disk, size-limited, and handed to the
  renderer as data URLs shown through an image element (so embedded script cannot run).
  With the registry disabled, or for any other origin, a built-in placeholder is used. The
  renderer never loads a remote image.

## R6. Installation and integrity

[verified] Integrity data is partial: 108 of 145 binary targets carry `sha256`; npm and
PyPI specs are pinned to an exact version but have no hash; nothing is signed; versions
are bumped hourly without human review.

- **Decision (binary)**: download over HTTPS to a staging directory; if `sha256` is
  present, verify and refuse on mismatch; extract with path-traversal protection; require
  `cmd` to start with `./` and contain no `..`; move into
  `<data>/agents/<id>/<version>/`. If `sha256` is absent, the confirmation dialog states
  that the download cannot be verified, and the application records the computed hash
  (trust on first use).
- **Decision (npx)**: do not run `npx`. Run `npm install <pinned spec> --save-exact
  --ignore-scripts` into `<data>/agents/<id>/<version>/` with the managed Node runtime
  (R7), keep the generated lockfile, and launch `node <package bin>`. If an agent does not
  work without install scripts, the user can allow scripts for that agent explicitly.
- **Decision (all)**: store the hash of the launch target at install and re-check it before
  every start; a mismatch blocks the start. Organization policy gains two items:
  `requireChecksum` (refuse agents without registry `sha256`) and `allowInstallScripts`.
- **Decision (updates)**: an update is a new install under a new version directory after
  user confirmation; nothing updates silently.
- **Alternatives considered**: `npx -y` on demand — rejected: re-resolves on every start
  and runs install scripts. Requiring signatures — impossible today, none are published.

## R7. Node runtime for npm-distributed agents

- **Decision**: download a pinned official Node.js runtime on the first npm-agent install,
  verified against a SHA-256 embedded in the application, into `<data>/runtimes/node/`.
  Use its bundled `npm` for installs.
- **Rationale**: Electron's "run as Node" mode would avoid the download but is disabled as
  part of hardening (R9). [verified] `claude-agent-acp` requires Node >= 22. JetBrains uses
  the same approach (pinned, hash-verified runtime).
- **Constitution**: this download is permitted by the 1.4.0 network constraint (pinned,
  checksum-verified runtime needed by an agent the user chose, named in the install
  confirmation). The install plan lists it as a separate line with its size.
- **Alternatives considered**: bundling Node in the installer — rejected: adds about
  40 MB per platform for users who never install an npm agent; system Node — rejected as default: version unknown, absent
  for many users; may be added later as an adopter option.

## R8. Detecting installed agents

- **Decision**: an agent counts as "found on the machine" when an executable matching a
  registry entry is on the user's `PATH`: for `binary` entries the basename of `cmd` with
  the entry's `args`; for `npx` entries the bin name from a small data file
  (`agent-hints.json`, e.g. `claude-agent-acp`, `codex-acp`) that adopters can edit. A
  found agent still requires the first-start confirmation (FR-058). The hints are passed to
  the core as an option by the host application; the core never reads application
  resources itself. Lookup uses the resolved shell environment (R19).
- **Rationale**: the registry does not publish bin names for packages. Keeping hints as
  data keeps core code free of agent-specific branches (Constitution I).

## R9. Desktop shell hardening

- **Decision**: renderer with `sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false`; content security policy `default-src 'self'`, images limited
  to `'self' data:`; all navigation and `window.open` denied and routed to the system
  browser after a confirmation showing the URL; permission requests (camera, etc.) denied;
  fuses: RunAsNode off, NODE_OPTIONS off, inspect arguments off, ASAR integrity on, load
  only from ASAR.
- **Decision (bridge)**: a fixed list of channels exposed by the preload script; every
  payload validated with zod in the main process; the renderer refers to sessions, agents,
  and files by identifiers issued by the main process and never sends raw paths or
  commands, except through native dialogs opened by the main process.
- **Decision (agent content)**: Markdown rendered with `react-markdown` without raw HTML,
  no remote images, links rendered as buttons that ask before opening.

## R10. Storage

- **Decision**: one SQLite database per user in the application data directory, accessed
  through a `Store` interface in the core. Use Node's built-in `node:sqlite`. Directory
  mode `0700`, file `0600` on POSIX; default per-user profile ACL on Windows.
- **Rationale**: run records need filtering and totals (FR-071); conversations need ordered
  append and paging (SC-008). A built-in driver avoids a second native module.
- **[verified 2026-11-18, T012]**: Electron `45.3.4` exposes `node:sqlite` (`DatabaseSync`)
  in the main process (and under `ELECTRON_RUN_AS_NODE`). Host Node 24 also works. Keep
  `node:sqlite`; retain `better-sqlite3` only as a documented emergency fallback behind the
  same `Store` interface if a future Electron drop removes the module.
- **Alternatives considered**: JSONL files — simple, but filtering and deletion by filter
  become full scans and rewrites.

## R11. Organization policy

- **Decision**: JSON file validated by a published JSON Schema
  ([contracts/policy.schema.json](./contracts/policy.schema.json)). Sources: built-in
  `resources/policy.default.json` in the packaged application; machine policy at
  `/Library/Application Support/Ster/policy.json` (macOS), `%ProgramData%\Ster\policy.json`
  (Windows), `/etc/ster/policy.json` (Linux). Merge per top-level item, machine wins. Read
  once at start. Present-but-invalid blocks new sessions (fail closed).
- **Rationale**: these locations are writable only by administrators by default and are
  reachable by every common device-management tool. The directory name follows the product
  name from the branding file.

## R12. Factory definition

- **Decision**: `.ster/factory.yaml` in the project, validated by
  [contracts/factory.schema.json](./contracts/factory.schema.json), parsed with the `yaml`
  package. Lookup walks from the session's working folder upward and takes the nearest
  file. Trust is stored locally per absolute folder path with the SHA-256 of the file; any
  content change resets trust.
- **Rationale**: YAML allows comments and multi-line template text, which matter for a
  file people review in pull requests.
- **Alternatives considered**: JSON — no comments; TypeScript config — would execute
  repository code, unacceptable for untrusted input.

## R13. Permission engine

- **Decision**: a pure function in the core: `(request, mode, sessionRules, policy) →
  prompt | auto-select(optionId)`.
  - `always-ask`: always prompt.
  - `ask-with-rules`: the prompt adds the application's own "remember for this session"
    choice. Choosing it stores a session rule keyed by tool kind (and tool name when
    given); matching later requests auto-select the agent's `allow_once` option and are
    recorded as decided by rule.
- **Decision (standing permission)**: option ids of kind `allow_always` and `reject_always`
  are never shown and never returned to an agent, in any mode. [verified] These kinds exist
  in the protocol and an agent may persist them itself, outside the application's view, so
  forwarding them would break FR-014. If a request offers no `allow_once` option, it can
  only be answered by the user choosing among the remaining one-time options or cancelling;
  no rule applies to it.
  - `auto-approve-reads`: requests whose tool kind is `read` or `search` auto-select the
    allow-once option; everything else, including missing kinds, prompts.
- **Decision (client-side guard)**: independent of what the agent asks, the client itself
  prompts when `fs/*` targets a path outside the working folder (resolved through
  symlinks), and when `terminal/create` arrives without a matching approval. A match is a
  permission request in the same turn whose tool call has kind `execute` and whose outcome
  was an allow (by user, rule, or mode); each such approval covers exactly one
  `terminal/create` and is then consumed. Without a match the guard prompts with the full
  command line and working directory.
- **Decision (stale writes)**: the client records a content hash for every file an agent
  reads or writes through it in a session. An `fs/write_text_file` to a file whose current
  hash differs from the recorded one raises a guard prompt before overwriting (FR-079).
- **Rationale**: agents differ in how reliably they request permission; the guard keeps
  Constitution III true for every agent.

## R14. Process model

- **Decision**: one agent process per session. Environment: the user's environment minus
  shell-injection variables (`NODE_OPTIONS`, `ELECTRON_*`), plus the registry entry's
  `env`. Process tree terminated on session end and on quit.
- **Rationale**: crash isolation per session, simple lifecycle, straightforward relaunch
  for terminal login. Five concurrent sessions (SC-006) are well within desktop limits.
- **Alternatives considered**: one process per agent shared by sessions — less memory,
  but one crash ends every session of that agent.

## R15. Run records and judging

- **Decision**: one run record per `session/prompt` call, written at start and finalised at
  stop (or marked `interrupted` on next launch if never finalised). Export is JSON Lines,
  one record per line, described by
  [contracts/run-record.schema.json](./contracts/run-record.schema.json).
- **Decision (judging)**: a separate, hidden ACP session with the chosen agent in the same
  folder, with `fs.writeTextFile: false` and `terminal: false` advertised, every non-read
  permission request rejected, and a read-only mode selected when the agent offers one.
  The prompt contains the criteria and the run transcript and asks for a JSON result.
- **Policy**: the judging agent must be allowed by organization policy, like any agent;
  otherwise the request is refused with `blocked-by-policy` (FR-074).
- **Scores**: every score stores its own scale. User ratings (1–5) and agent scores (the
  definition's scale) are filtered and totalled separately and never combined.
- **Limitation**: an agent that edits files with its own tools without asking cannot be
  fully prevented from doing so by a client; the documentation says so and recommends
  judging with agents that honor permission requests.

## R16. Extension points

- **Decision**: compile-time extensions. An adopter adds a module under
  `apps/desktop/src/extensions/` and registers it in one file. Contracts: `PanelExtension`
  (renderer), `AgentSource`, `PermissionModeDefinition`, `PolicyItemDefinition`,
  `SessionEventConsumer` (core), and translation resources. See
  [contracts/core-api.md](./contracts/core-api.md).
- **Rationale**: runtime-loaded plugins would be a new code-execution path to secure
  (Constitution VI) and nothing in the spec needs them (Constitution IV, YAGNI).

## R17. Toolchain

| Concern | Choice | Note |
|---|---|---|
| Workspace | pnpm workspaces | `packages/core`, `packages/mock-agent`, `apps/desktop` |
| Build and dev | electron-vite | main, preload, renderer in one config |
| Installers | electron-builder | dmg + zip, NSIS, AppImage + deb; no developer signature or notarization; macOS builds carry an ad hoc signature (required on Apple silicon), checked in CI with `codesign`; signing fields documented |
| UI | React, Tailwind CSS, Radix primitives | accessible dialogs and menus |
| Renderer state | Zustand | one store per concern |
| Long lists | TanStack Virtual | SC-008 |
| Diff | `diff` (jsdiff) + own component | no heavy diff viewer dependency |
| i18n | i18next + react-i18next | typed keys; CI script checks EN/PL key parity |
| Validation | zod | already a peer dependency of the SDK |
| Unit and integration tests | Vitest, v8 coverage, 80% threshold on `packages/core` | against `mock-agent` |
| End-to-end tests | Playwright driving Electron | one flow per user story, with `mock-agent` |
| Static checks | TypeScript strict, typescript-eslint strict-type-checked, Prettier | |
| Dependency audit | `pnpm audit --audit-level high` in CI | blocks release |
| CI | GitHub Actions matrix: macOS, Windows, Ubuntu | release workflow on tag |

Exact versions are the current stable releases at implementation time, pinned by lockfile.

## R18. Performance

- **Decision**: coalesce streamed chunks in the main process and forward to the renderer
  at most once per animation frame (~16 ms); append to the database in batches; render the
  conversation with a virtualised list; page older items from the database.
- **Targets**: first visible output < 1 s after the agent emits it (SC-002), session
  switch < 1 s (SC-006), 1,000 items without input lag (SC-008).

## R19. Shell environment

- **Decision**: on macOS and Linux, resolve the user's login-shell environment once at
  start by running the user's shell as a login shell that prints its environment between
  unique markers, with a 5-second limit. Use the result for agent detection, agent launch,
  the command runner, and the login terminal. On failure or timeout, fall back to the
  process environment extended with the common per-user and package-manager binary
  directories, and log the fallback. On Windows the process environment is used as is.
- **Rationale**: an application started from the desktop does not inherit the `PATH` set
  in shell startup files, so vendor CLIs, `uv`, and version-managed tools would not be
  found. The shell startup files are the user's own and are already trusted by every
  terminal they open.
- **Alternatives considered**: asking the user to configure paths — poor first run;
  scanning a fixed directory list only — misses version managers.

## R20. Interface layout and visual language

- **Decision (layout)**: the "mission control" layout shown in the mockup at
  `design/mockup/index.html`: a slim icon rail for sections (Conversation, Agents, Runs,
  Settings); a session board listing every session as a card with status chip (working,
  waiting for approval, finished, failed), progress, agent, and model, topped by status
  counts; the selected session's conversation beside the board, with the plan as a compact
  checklist at the top of the conversation and actions, diffs, and command output inline.
  Chosen by the product owner on 2026-11-18 over an editor-like and a chat-first variant (both since removed from the mockup).
- **Decision (visual language)**: taken from a reference supplied by the product owner and
  realised in the mockup: monochrome palette (light gray page, the application as one
  rounded panel, white cards with hairline borders, near-black text and primary button);
  color only in small status dots and chips and in the amber edge of approval requests;
  one neutral sans typeface; small uppercase monospace labels for sections and table
  headers; dark theme as the inversion. The mockup's CSS custom properties are the source
  for the design tokens.
- **Decision (approval presentation)**: agent approval requests appear as a bar docked
  above the composer, so the conversation context stays visible; client-guard requests
  (path outside the folder, command without a matching approval, stale write) use a
  blocking dialog. Confirmed by the product owner on 2026-11-18.
- **Rationale**: the product is meant to supervise several agents at once and to grow into
  a software-factory console, which the board-first layout serves directly.
- **Status of the mockup**: a design reference with fake data, not production code. Where
  the mockup and the spec disagree, the spec wins.

