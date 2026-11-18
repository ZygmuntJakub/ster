/**
 * Organization policy service (contracts/core-api.md).
 * Full enforcement arrives in US10; this stub exposes loading hooks and the absent state.
 */

export type PolicyState = "absent" | "valid" | "invalid";

export type PolicySourceKind = "builtin" | "machine" | "memory";

export interface PolicySource {
  kind: PolicySourceKind;
  /** Human-readable origin (path or label). */
  label: string;
  /** Return a policy document, or `null` when this source has no file. */
  load(): Promise<null | object>;
}

export interface PolicyProblem {
  path: string;
  message: string;
}

export interface EffectivePolicyItem<T = unknown> {
  key: string;
  value: T;
  source: PolicySourceKind;
  managed: boolean;
}

export interface EffectivePolicy {
  items: EffectivePolicyItem[];
}

export interface PolicyService {
  readonly state: PolicyState;
  effective(): EffectivePolicy;
  problems(): PolicyProblem[];
  /** Reload sources. Enforcement call sites remain no-ops until US10. */
  reload(): Promise<void>;
}

export interface CreatePolicyServiceOptions {
  sources?: PolicySource[];
}

/**
 * Create a policy service. With no sources (or all sources returning null), state is `absent`.
 */
export function createPolicyService(options: CreatePolicyServiceOptions = {}): PolicyService {
  const sources = options.sources ?? [];
  let state: PolicyState = sources.length === 0 ? "absent" : "absent";
  let problems: PolicyProblem[] = [];
  let items: EffectivePolicyItem[] = [];

  const service: PolicyService = {
    get state() {
      return state;
    },
    effective() {
      return { items: [...items] };
    },
    problems() {
      return [...problems];
    },
    async reload() {
      // Stub: presence of any non-null document flips state to valid without schema checks.
      // US10 replaces this with schema validation and merge.
      problems = [];
      items = [];
      let sawDocument = false;
      for (const source of sources) {
        const document = await source.load();
        if (document === null) {
          continue;
        }
        sawDocument = true;
        items.push({
          key: "_raw",
          value: document,
          source: source.kind,
          managed: source.kind === "machine",
        });
      }
      state = sawDocument ? "valid" : "absent";
    },
  };

  return service;
}

/**
 * No-op enforcement hook used by later call sites until US10 wires real checks.
 */
export function enforcePolicyNoop(service: PolicyService): void {
  // Call sites exist before US10 enforcement; keep the dependency live for typing.
  if (service.state === "invalid") {
    return;
  }
}
