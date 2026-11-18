# Contract: Core API, Session Events, Extension Points

**Package**: `packages/core` (`@ster/core`) | **Consumers**: the desktop main process,
`examples/headless.ts`, adopter extensions, and the later cloud stage.

The core has no Electron or DOM imports and makes no assumption that a person is present.
Anything that needs a human decision is expressed as a pending request that some front end
resolves. Signatures below are the contract; implementations may add optional parameters
but may not remove or repurpose anything listed here without a changelog entry (FR-062).

## Creating the core

```ts
createCore(options: {
  dataDir: string;                 // per-user data directory
  brand: Brand;                    // product name, directory names
  policySources: PolicySource[];   // built-in and machine policy, in precedence order
  agentHints?: AgentHints;         // executable names for detecting installed agents
  environment?: ResolvedEnv;       // resolved shell environment; core resolves it when omitted
  extensions?: CoreExtensions;     // see "Extension points"
  platform?: PlatformAdapter;      // open external URL, spawn interactive terminal
}): Promise<Core>

interface Core {
  agents: AgentService;
  sessions: SessionService;
  policy: PolicyService;
  factory: FactoryService;
  runs: RunService;
  settings: SettingsService;
  events: EventStream<CoreEvent>;
  dispose(): Promise<void>;        // ends sessions, kills process trees, closes the store
}
```

The core never reads files from the host application: policy, agent hints, and brand are
always passed in. `createCore` fails only on an unusable data directory. An invalid policy does not fail
creation: `policy.state` is `invalid` and session creation is refused.

## Services

```ts
interface AgentService {
  list(): Promise<Agent[]>;                               // registry + detected + custom, with readiness
  icon(agentId: string): Promise<IconData | null>;        // only from the registry in effect
  refreshRegistry(opts?: { force?: boolean }): Promise<RegistryStatus>;
  planInstall(agentId: string): Promise<InstallPlan>;     // what, from where, verified or not
  install(plan: InstallPlan, onProgress?: (p: Progress) => void): Promise<Agent>;
  remove(agentId: string): Promise<void>;
  saveCustom(def: CustomAgentInput): Promise<Agent>;
  deleteCustom(agentId: string): Promise<void>;
  confirmFirstStart(agentId: string): Promise<void>;      // FR-058
}

interface SessionService {
  create(input: { agentId: string; cwd: string; permissionMode?: string }): Promise<Session>;
  list(filter?: SessionFilter): Promise<SessionSummary[]>;
  get(sessionId: string): Promise<Session>;
  items(sessionId: string, page: { before?: number; limit: number }): Promise<ConversationItem[]>;
  prompt(sessionId: string, content: PromptContent[]): Promise<RunRecord>;  // resolves when the turn stops
  cancel(sessionId: string): Promise<void>;
  resolveApproval(approvalId: string, outcome: { optionId: string } | { cancelled: true }): Promise<void>;
  setPermissionMode(sessionId: string, mode: string): Promise<void>;
  setConfigOption(sessionId: string, configId: string, value: string): Promise<void>;
  rules(sessionId: string): Promise<PermissionRule[]>;
  revokeRule(ruleId: string): Promise<void>;
  killCommand(commandRunId: string): Promise<void>;
  authMethods(sessionId: string): Promise<AuthMethod[]>;
  authenticate(sessionId: string, methodId: string): Promise<void>;
  resume(sessionId: string): Promise<Session>;            // rejects when not resumable
  restart(sessionId: string): Promise<Session>;           // after failure
  rename(sessionId: string, title: string): Promise<void>;
  end(sessionId: string): Promise<void>;
  delete(sessionId: string, opts: { runRecords: 'delete' | 'keep-without-text' }): Promise<void>;
}

interface PolicyService {
  readonly state: 'absent' | 'valid' | 'invalid';
  effective(): EffectivePolicy;                           // items + which source set each
  problems(): PolicyProblem[];                            // when invalid
}

interface FactoryService {
  find(cwd: string): Promise<FactoryLookup | null>;       // nearest definition + trust state + diff vs trusted
  trust(folder: string, contentHash: string): Promise<void>;
  revoke(folder: string): Promise<void>;
  applied(sessionId: string): Promise<AppliedDefinition | null>;  // incl. parts dropped by policy
  renderTemplate(sessionId: string, templateId: string, inputs: Record<string, string>): Promise<string>;
}

interface RunService {
  list(filter: RunFilter, page: Page): Promise<{ runs: RunSummary[]; totals: RunTotals }>;
  get(runId: string): Promise<RunRecord>;
  rate(runId: string, rating: { value: number; note?: string }): Promise<Score>;
  judge(runId: string, opts: { agentId: string }): Promise<Score>;
  export(filter: RunFilter, destination: WritableTarget): Promise<{ count: number }>;
  delete(filter: RunFilter | { ids: string[] }): Promise<{ count: number }>;
}
```

### Errors

Every rejected call carries a typed `SterError` with a stable `code`:
`policy-invalid`, `blocked-by-policy`, `agent-not-ready`, `agent-not-confirmed`,
`integrity-failed`, `login-required`, `protocol-unsupported`, `agent-exited`,
`outside-workspace`, `not-resumable`, `definition-invalid`, `definition-untrusted`,
`not-found`, `invalid-argument`. User-facing text is produced by the front end from the
code, never from the error message.

## Session events (FR-060)

`core.events.subscribe(listener, filter?)` returns an unsubscribe function. Events are
delivered in order per session and are also what the desktop renderer consumes.

```ts
type CoreEvent =
  | { type: 'session.created' | 'session.status' | 'session.updated' | 'session.deleted'; sessionId: string; session?: SessionSummary }
  | { type: 'item.appended'; sessionId: string; item: ConversationItem }
  | { type: 'item.updated'; sessionId: string; seq: number; patch: ItemPatch }      // streaming text, action status
  | { type: 'approval.requested'; sessionId: string; approval: ApprovalRequest }
  | { type: 'approval.resolved'; sessionId: string; approvalId: string; outcome: ApprovalOutcome }
  | { type: 'command.started' | 'command.output' | 'command.exited'; sessionId: string; commandRunId: string; data?: string; exit?: Exit }
  | { type: 'run.started' | 'run.finished'; sessionId: string; run: RunSummary }
  | { type: 'score.recorded'; runId: string; score: Score }
  | { type: 'agent.changed'; agentId: string }
  | { type: 'registry.updated'; status: RegistryStatus };
```

Guarantees: every event has `at` (time) and a per-session monotonically increasing `n`;
`run.finished` is emitted exactly once per `run.started`, including for cancelled, failed,
and interrupted runs; events never contain credentials.

## Extension points (FR-059)

Registered at start through `CoreExtensions` (core side) and the renderer registry (UI
side). All are plain typed objects compiled into the application; nothing is loaded at
runtime.

```ts
interface CoreExtensions {
  agentSources?: AgentSource[];                 // besides registry, detection, custom
  permissionModes?: PermissionModeDefinition[]; // besides the three built-in modes
  policyItems?: PolicyItemDefinition[];         // extra policy keys with schema and enforcement
  eventConsumers?: SessionEventConsumer[];      // recording, reporting, automation
}

interface AgentSource {
  id: string;
  list(ctx: SourceContext): Promise<AgentCandidate[]>;
}

interface PermissionModeDefinition {
  id: string;
  labelKey: string;                             // translation key
  decide(req: PermissionRequestView, ctx: PermissionContext): 'prompt' | { select: string };
}

interface PolicyItemDefinition<T = unknown> {
  key: string;                                  // top-level policy key, namespaced "x-…"
  schema: ZodType<T>;
  enforce(value: T, hooks: PolicyHooks): void;  // may only restrict
}

interface SessionEventConsumer {
  id: string;
  onEvent(event: CoreEvent): void | Promise<void>;   // failures are logged, never block the session
}
```

Renderer side (`apps/desktop/src/extensions/`):

```ts
interface PanelExtension {
  id: string;
  titleKey: string;
  placement: 'sidebar' | 'session-side' | 'settings';
  component: React.ComponentType<{ sessionId?: string }>;   // receives data only through the bridge
}
```

Rules for extensions: a permission mode may never approve a `client-guard` request for a
path outside the working folder; a policy item may only restrict; an event consumer
receives events but has no access to approvals. Adding a language means adding one
resource file and one line in the language list.

## Headless use (FR-061)

`examples/headless.ts` creates the core with a temporary data directory, starts a session
with `mock-agent`, resolves approvals programmatically, prints the resulting run record,
and exits. It runs in CI as an integration test.
