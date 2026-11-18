# Quickstart and Validation Guide: Ster — ACP Desktop Client

**Purpose**: prove, end to end, that each user story works. This is a run-and-check guide;
design details are in [data-model.md](./data-model.md) and [contracts/](./contracts/).

The commands below are the scripts the implementation must provide. They do not exist
until the corresponding tasks are done.

## Prerequisites

- Node.js >= 24 and pnpm.
- Git.
- For validation with a real agent: one vendor CLI login (for example a Claude or ChatGPT
  subscription). Not needed for automated checks, which use the mock agent.

## Setup

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` starts the application in development mode with the mock agent available in the
agent list.

## Automated gates (every increment)

```bash
pnpm check
```

`pnpm check` runs formatting check, type check, lint, translation parity (EN/PL), unit and
integration tests with coverage (core >= 80% lines), and the dependency audit.

```bash
pnpm test:e2e
```

`pnpm test:e2e` runs one Playwright flow per user story against the mock agent.

```bash
pnpm test:security
```

`pnpm test:security` runs the hostile-content, hostile-renderer, path-confinement, and
hostile-definition suites (SC-016, SC-018).

```bash
pnpm example:headless
```

`pnpm example:headless` drives the core without a UI and prints one run record (FR-061).

**Expected**: all four exit with status 0 on macOS, Windows, and Linux.

## Manual validation by increment

Use the mock agent unless a real agent is named. Its scripted scenarios are selected from
the message text (for example `scenario: edit-file`).

### Increment 1 — US1, US2, US3

| # | Do | Expect |
|---|---|---|
| 1 | Start a session with the mock agent in a scratch folder; send `scenario: hello` | Reply streams in; turn ends; input is enabled again |
| 2 | Send `scenario: long`, press Stop | Partial reply stays; a new message can be sent; run outcome is `cancelled` |
| 3 | Send `scenario: edit-file` in mode "always ask" | One approval prompt; after allowing, an action card goes pending → in progress → completed and shows a diff with the file path |
| 4 | Send `scenario: plan` | A plan appears and its steps change status |
| 5 | Switch to "ask with remembered decisions", allow an edit with "always"; repeat the scenario | No second prompt; the conversation notes the automatic approval; the rule is listed and can be revoked |
| 6 | Switch to "auto-approve reads"; send `scenario: read-then-edit` | The read passes without a prompt; the edit prompts |
| 7 | Send `scenario: escape-workspace` | A guard prompt names the path outside the folder; rejecting it returns an error to the agent |
| 8 | Send `scenario: crash` | Clear error, conversation preserved, Restart works |
| 9 | Send `scenario: hostile-content` | No script runs, no remote image loads, links ask before opening |
| 10 | With a real agent that is logged out, start a session | "Login required" with the agent's methods; completing login starts the session; the application never asks for a key or password |
| 11 | Send `scenario: permission-always` in each mode | The agent's "always" choices are not shown; in "ask with remembered decisions" the application's own remember choice appears; the agent only ever receives a one-time answer |
| 12 | Send `scenario: write-after-external-edit`, edit the file by hand when asked, continue | A prompt warns the file changed before it is overwritten |
| 13 | Delete the working folder during a session | Session marked failed with an explanation; conversation kept |

### Increment 2 — US4, US5

| # | Do | Expect |
|---|---|---|
| 1 | Open the agent list online | Found, installable, and unavailable-on-this-system agents are distinguished |
| 2 | Install a binary agent that publishes a checksum | Confirmation shows source and "verified"; agent becomes ready |
| 3 | Install an agent without a checksum | Confirmation states it cannot be verified |
| 4 | Corrupt the installed launch file and start the agent | Start is refused with an integrity error |
| 5 | Add a custom agent pointing at the mock agent; start it | First-start confirmation shows the command; session works |
| 6 | Disconnect the network; open the agent list | Installed and custom agents work; registry shown as unreachable |
| 7 | Send `scenario: run-command`, then `scenario: run-long` and stop it | Live output and exit result; the long command ends and the agent is told |
| 8 | Quit with a command running | No orphan process remains |
| 9 | Launch the packaged application from the desktop (not a terminal) and open the agent list | Agents installed in shell-configured locations are still found |

### Increment 3 — US6, US7, US8

| # | Do | Expect |
|---|---|---|
| 1 | Run two sessions; trigger an approval in the hidden one | The session list shows it needs attention; the other keeps working |
| 2 | Restart the application | Both sessions listed with title, agent, folder, last activity; readable |
| 3 | Continue a session with an agent that supports resume, and open one that does not | First continues with context; second is read-only with "new session in this folder" |
| 4 | With an agent offering modes, models, and commands, change each | Session reflects the change; typing `/` lists commands |
| 5 | With an agent offering none | The controls are absent |
| 6 | Switch language in settings | All text changes without restart; choice persists |

### Increment 4 — US10, US9

| # | Do | Expect |
|---|---|---|
| 1 | Place a machine policy allowing one agent, custom agents off, only `always-ask` | Only that agent starts; others show "blocked by organization"; mode selector locked; settings marked as managed |
| 2 | Set `registry.mode` to `custom` with a local copy of the index | List comes from it; no request to the public registry (check with the network log) |
| 3 | Make the policy file invalid | Explanation shown; no session can start; history readable |
| 4 | Remove the policy | Unrestricted behavior returns |
| 5 | Follow the README from a fresh clone on a clean machine | Running application in under 10 minutes |
| 6 | Push a version tag | Installers for macOS, Windows, and Linux attached to a draft release in under 30 minutes |
| 7 | Change `resources/brand.json` and rebuild | Window title, about screen, data directory, and installer name all change |

### Increment 5 — US11, US12

| # | Do | Expect |
|---|---|---|
| 1 | Add `.ster/factory.yaml` to a folder; start a session there | The application shows what it would change and applies nothing until trusted |
| 2 | Trust it | Declared agent, mode, and templates are in effect |
| 3 | Edit the file; start another session | Changes are shown and trust is asked again |
| 4 | Use a definition that asks for a mode the policy forbids | Policy wins; the dropped part is reported |
| 5 | Pick a task template, fill its blank, send | The rendered text is sent as the message |
| 6 | Complete, cancel, and crash one run each | Three run records with correct outcomes; none missing |
| 7 | Filter runs by agent and date | Matching runs with totals |
| 8 | Rate a run; have another judged | User rating stored; agent score stored with reasoning and judge identity; judging changed no files |
| 9 | Export runs | A JSON Lines file valid against [run-record.schema.json](./contracts/run-record.schema.json); nothing sent over the network |

## Validation against a real agent (before each release)

Run the reference task from SC-003 — "read a file, edit it, run a command" — with at least
three registry agents of different distribution types, without any agent-specific change.
Record the results in the release notes.
