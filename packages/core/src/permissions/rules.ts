import { randomUUID } from "node:crypto";

/**
 * Session-scoped remembered decision (data-model.md PermissionRule).
 */
export interface PermissionRule {
  id: string;
  sessionId: string;
  match: { kind: string; toolName?: string };
  decision: "allow";
  createdAt: string;
}

export interface RuleMatchInput {
  kind?: string;
  toolName?: string;
}

export function ruleMatches(rule: PermissionRule, input: RuleMatchInput): boolean {
  if (!input.kind || rule.match.kind !== input.kind) {
    return false;
  }
  if (rule.match.toolName !== undefined) {
    return input.toolName === rule.match.toolName;
  }
  return true;
}

export function findMatchingRule(
  rules: ReadonlyArray<PermissionRule>,
  input: RuleMatchInput,
): PermissionRule | undefined {
  return rules.find((rule) => ruleMatches(rule, input));
}

export function createRuleStore() {
  const bySession = new Map<string, PermissionRule[]>();

  return {
    list(sessionId: string): PermissionRule[] {
      return [...(bySession.get(sessionId) ?? [])];
    },

    add(input: { sessionId: string; kind: string; toolName?: string }): PermissionRule {
      const rule: PermissionRule = {
        id: randomUUID(),
        sessionId: input.sessionId,
        match:
          input.toolName !== undefined
            ? { kind: input.kind, toolName: input.toolName }
            : { kind: input.kind },
        decision: "allow",
        createdAt: new Date().toISOString(),
      };
      const list = bySession.get(input.sessionId) ?? [];
      list.push(rule);
      bySession.set(input.sessionId, list);
      return rule;
    },

    revoke(ruleId: string): PermissionRule | undefined {
      for (const [sessionId, list] of bySession.entries()) {
        const index = list.findIndex((rule) => rule.id === ruleId);
        if (index >= 0) {
          const [removed] = list.splice(index, 1);
          if (list.length === 0) {
            bySession.delete(sessionId);
          } else {
            bySession.set(sessionId, list);
          }
          return removed;
        }
      }
      return undefined;
    },

    clearSession(sessionId: string): void {
      bySession.delete(sessionId);
    },
  };
}

export type RuleStore = ReturnType<typeof createRuleStore>;
