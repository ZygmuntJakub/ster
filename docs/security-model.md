# Security model

Ster is a local ACP **client**. It hardens its own process and confines the file and
terminal capabilities _it_ exposes to agents. It is not a full sandbox for arbitrary agent
binaries.

## What Ster confines

- **Workspace files via ACP `fs/*`** — reads/writes go through Ster, are realpath-checked,
  and stay inside the session folder unless the user approves an outside-workspace
  client-guard exception.
- **Commands via ACP `terminal/*`** — created through Ster, shown in the UI, stoppable,
  and gated by the permission / execute-approval path.
- **Renderer** — sandboxed Electron, CSP, no Node integration, bridge allow-list with
  zod validation and top-level sender checks.
- **Agent process environment** — `NODE_OPTIONS` / `ELECTRON_*` stripped on spawn.

## What Ster does not confine

Agents are ordinary OS processes. If an agent edits files, opens network connections, or
runs tools **with its own code** without going through ACP `fs/*` or `terminal/*`, Ster
cannot fully prevent that. The UI and conversation show what the agent reports; they are
not a guarantee of host isolation.

**Recommendation:** prefer agents that honor ACP permission requests, combine Ster with OS
user isolation or containers when hosting untrusted agents, and read vendor terms before
connecting a subscription.

## Credentials

Ster does not request, store, or transmit model-provider API keys. Login is always the
agent’s own flow (FR-016).

## Organization policy

When US10 policy is present, Ster can allow-list agents, lock permission modes, and
require install checksums. Policy can only tighten behavior, never loosen confinement
guarantees above.
