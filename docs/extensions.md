# Extensions

Ster extensions are **compile-time** modules (research.md R16). There is no runtime plugin
loader. Register everything in one place and rebuild.

## Panel extension (renderer)

Contract (`PanelExtension`):

- `id` — stable id used as the rail section key
- `titleKey` — i18n key for the label
- `placement` — `sidebar` | `session-side` | `settings`
- `component` — React component; talk to the app only through `window.ster` (the bridge)

Example: `apps/desktop/src/extensions/example-panel/index.tsx`  
Registration: `apps/desktop/src/extensions/index.ts`

```ts
import { examplePanel } from "./example-panel/index.js";
export const panelExtensions = [examplePanel];
```

Sidebar panels appear on the icon rail automatically. Settings-placement panels render at
the bottom of the Settings pane.

## Agent source (core)

Implement `AgentSource` from `@ster/core` and pass it in `createCore({ extensions: {
agentSources: […] } })`. Sources merge into the agent list; see
`packages/core/tests/unit/agent-sources.test.ts`.

## Permission mode (core)

Implement `PermissionModeDefinition` and pass `extensions.permissionModes`. Modes must
never auto-approve a `client-guard` request for a path outside the working folder.

## Policy item (core)

Implement `PolicyItemDefinition` for organization policy keys. Items may **only restrict**;
loosening a built-in restriction is rejected (US10 / FR-059).

## Session event consumer (core)

Implement `SessionEventConsumer` and pass `extensions.eventConsumers`. Consumers observe
the event stream; failures are logged and never block the session. They must not resolve
approvals.

## Languages

Adding a language is also an extension point — see [adding-a-language.md](./adding-a-language.md).

## Breaking changes

Any change that breaks an extension contract must be called out in `CHANGELOG.md` (FR-062).
