# Ster Constitution

## Core Principles

### I. Protocol-First, Agent-Agnostic

- The application MUST talk to agents only through the Agent Client Protocol (ACP), using
  the official SDK and the standard subprocess transport.
- Core code MUST NOT contain branches keyed on a specific agent's name or vendor. Any
  agent that passes ACP initialization MUST be usable.
- Optional features (session resume, modes, models, slash commands, terminal, file access)
  MUST be driven by the capabilities the agent advertises. A feature the agent does not
  advertise MUST be hidden or disabled, never faked.

Rationale: the value of the project is agent interchangeability. One agent-specific
shortcut breaks it for everyone who forks the template with a different agent.

### II. User-Owned Credentials

- The application MUST NOT ask for, store, proxy, or transmit model-provider API keys or
  subscription tokens.
- Authentication MUST be delegated to the agent and the vendor's own login flow on the
  user's machine. The application only reports that login is required and how to do it.
- The application MUST NOT send conversation content, file content, or usage data to any
  service other than the agent process the user selected and the agent registry in effect
  (the public registry by default, or the one named by organization policy).

- Run records, scores, and exports MUST stay on the user's machine unless the user moves
  them; the application MUST NOT upload them.

Rationale: users run agents on their own subscriptions. Handling their credentials would
create security and terms-of-service risk for every downstream fork.

### III. Explicit Consent and Least Privilege

- Every permission request from an agent MUST be resolved by the user's currently selected
  permission mode; no request may be silently approved outside that mode.
- File and terminal operations performed on behalf of an agent MUST be confined to the
  session's working folder unless the user explicitly approves otherwise.
- Installing or running an agent binary MUST require an explicit user action that shows
  what will be installed or executed and where it comes from.
- A decision the user chooses to remember MUST be kept and applied by the application and
  MUST NOT be handed to the agent as standing permission, so that every remembered decision
  stays visible and revocable.
- Confinement and supervision apply to operations an agent performs through the
  application. Wherever the application describes them, it MUST state that an agent acting
  with its own tools is outside that control.
- Organization policy MUST only restrict what the application offers and MUST NOT approve
  agent actions on the user's behalf. Settings controlled by policy MUST be visibly marked
  as managed. A policy that is present but invalid MUST block new agent sessions rather
  than fall back to unrestricted behavior.
- The UI layer MUST run sandboxed, without direct access to the file system or process
  spawning; privileged operations go through a narrow, typed bridge to the main process.

Rationale: the application runs third-party agents that edit files and execute commands.
The user must stay in control, and a compromised UI must not gain system access.

### IV. Simple, Extensible Core

- The codebase MUST keep three clearly separated layers: agent/protocol management,
  the typed bridge, and the UI. Each MUST be understandable and replaceable on its own.
- New dependencies and abstractions MUST be justified by a current requirement; speculative
  generality is rejected (YAGNI).
- Every user-visible string MUST go through the translation mechanism; English and Polish
  MUST stay complete for every release.
- The core (protocol handling, sessions, permissions, policy, history) MUST NOT depend on
  the UI or on the desktop shell, so that it can be driven by another front end or run
  without one.
- Extension points (a UI panel, a permission mode, an agent source, a policy item, a
  language, a consumer of session events) MUST be explicit, typed contracts. Adding one
  MUST NOT require editing core modules, and each MUST be documented with an example.
- A change that breaks an extension contract MUST be called out in the changelog and
  release notes.

Rationale: this is a template that others adapt and that an organization will grow into
its own harness. Code a newcomer cannot follow in an afternoon, or that can only be
extended by patching the core, defeats the purpose.

### V. Tested Protocol Boundary

- The protocol layer MUST be covered by automated tests that run against a mock ACP agent,
  including streaming updates, permission requests, cancellation, and agent crashes.
- Type checking, linting, and the test suite MUST pass in CI on macOS, Windows, and Linux
  before a change is merged.
- A bug found in protocol handling MUST be reproduced with a failing test before it is
  fixed.

Rationale: agents differ in behavior and versions. Without tests at the protocol boundary,
regressions appear only with a particular agent on a particular user's machine.

### VI. Secure by Default

- Everything an agent sends (text, formatted content, file paths, links, command text) is
  untrusted input. It MUST be validated at the protocol boundary and rendered without the
  ability to execute script or load remote resources.
- Every message crossing the bridge between UI and main process MUST be validated against
  a schema on the privileged side; the UI MUST NOT be able to name arbitrary paths,
  commands, or channels.
- The shell MUST run with the platform's hardening enabled (process sandboxing, context
  isolation, a restrictive content security policy, no remote code), and navigation or
  new windows to external content MUST open in the user's browser only after a user action.
- Agent downloads MUST come over an authenticated channel and MUST be verified against
  the integrity information the registry provides before first run; an agent that fails
  verification MUST NOT be started.
- Configuration that arrives with a project folder (such as a factory definition) is
  untrusted input. It MUST NOT take effect before the user has trusted it for that folder,
  MUST be re-confirmed when it changes, and MUST NOT loosen organization policy, approve
  actions, or start a program without the user's confirmation.
- Logs and stored history MUST NOT contain credentials, and stored data MUST be readable
  only by the user's own account.
- Dependencies MUST be pinned by lockfile and audited in CI; a known high-severity
  vulnerability in a shipped dependency blocks release.
- Every feature plan MUST state its security impact: what new input is trusted, what new
  privilege is granted, and how it can be abused.

Rationale: the application starts third-party programs that edit code and run commands
inside an organization. Safe behavior must be the starting state, not a setting.

### VII. Code Quality Gates

- The strictest practical compiler and linter settings are on for all code; escapes from
  the type system and suppressed lint rules MUST carry a comment that justifies them.
- Formatting is automated and enforced in CI; style is not discussed in review.
- Core modules MUST have unit tests for their behavior and MUST keep at least 80% line
  coverage; user-facing flows of each user story MUST have at least one end-to-end test.
- Every change is reviewed before merge, is small enough to review in one sitting, and
  leaves no dead code, commented-out code, or unexplained TODO.
- Errors MUST be handled or surfaced to the user; silently swallowing an error is a defect.
- Public functions and extension contracts MUST have documentation comments that state
  purpose and constraints.

Rationale: a template is copied, and its flaws are copied with it. An organization that
builds its software factory on this code inherits its quality level.

## Technology & Platform Constraints

- Desktop shell: Electron. Language: TypeScript in strict mode for all layers.
- UI: React, Vite, Tailwind CSS.
- Protocol: the official ACP TypeScript SDK; agents run as local subprocesses over stdio.
- Platforms: macOS, Windows, and Linux are all first-class.
- No backend service: the application MUST work without any server operated by the
  project. The only network use by the application itself is: the agent registry in effect
  and resources it hosts (such as agent icons); downloads of agents the user chose to
  install; and downloads of pinned, checksum-verified runtimes that such an agent needs,
  named in the same install confirmation. Organization policy is delivered as
  local configuration (built into a fork's build or placed on the machine), never fetched
  from a management service.
- Distribution: source repository plus installers for the three platforms built in CI and
  published as GitHub Releases. Installers are unsigned until certificates are configured;
  the configuration MUST keep a documented place for signing credentials.
- Product direction: Ster is built in stages towards an organizational software factory.
  The current stage is the desktop application. A later stage adds unattended runs in
  isolated cloud environments, a self-improvement loop, and benchmarks. Formats introduced
  now (factory definition, run records, session events) MUST be designed for reuse by
  that stage, and no current code may assume that a person is present at a screen except
  in the UI layer.
- License: MIT. Code, comments, commit messages, and documentation are in English.
- Naming: the product is called Ster. The repository is named `ster`; the package and
  application identifier use `ster-desktop`, because the bare `ster` name is taken on npm.
  The product name, icon, and colors MUST be defined in one place so a fork can rebrand
  without touching feature code.

## Development Workflow & Quality Gates

- Work follows the Spec Kit flow: specification, plan, tasks, implementation. Each feature
  lives on its own branch with its artifacts under `specs/`.
- Every plan MUST include a Constitution Check against the principles above; any deviation
  MUST be recorded with its justification in the plan's complexity tracking.
- A change is mergeable only when CI passes (format, type check, lint, tests with coverage,
  dependency audit, on all three platforms), both translations are complete, and it has
  been reviewed.
- Changes to the typed bridge, permission handling, policy, or agent installation MUST be
  reviewed against Principles III and VI explicitly.
- User-facing behavior changes MUST update the README or docs in the same change.

## Governance

- This constitution supersedes other project conventions. Where a spec, plan, or review
  comment conflicts with it, the constitution wins or is amended first.
- Amendments are made through a pull request that edits this file, states the reason,
  and lists the artifacts that need to follow.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle,
  MINOR for adding a principle or materially expanding guidance, PATCH for clarifications.
- Compliance is checked at plan time (Constitution Check) and at review time for every
  pull request.

**Version**: 1.4.0 | **Ratified**: 2026-11-18 | **Last Amended**: 2026-11-18
