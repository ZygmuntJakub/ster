import { useCallback, useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

export interface PermissionRuleView {
  id: string;
  sessionId: string;
  match: { kind: string; toolName?: string };
  decision: "allow";
  createdAt: string;
}

export interface RulesPanelProps {
  sessionId: string;
  refreshKey?: number;
}

/**
 * Remembered session decisions with revoke (FR-014).
 */
export function RulesPanel({ sessionId, refreshKey = 0 }: RulesPanelProps): JSX.Element | null {
  const { t } = useTranslation();
  const [rules, setRules] = useState<PermissionRuleView[]>([]);

  const reload = useCallback(() => {
    void window.ster.sessions.rules({ sessionId }).then((list) => {
      setRules(list as PermissionRuleView[]);
    });
  }, [sessionId]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  if (rules.length === 0) {
    return null;
  }

  return (
    <div
      className="border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2"
      data-testid="rules-panel"
    >
      <p className="lbl mb-1">{t("permission.rulesTitle")}</p>
      <ul className="flex flex-col gap-1">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="mono text-[var(--ink)]">
              {rule.match.kind}
              {rule.match.toolName ? ` · ${rule.match.toolName}` : ""}
            </span>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                void window.ster.sessions.revokeRule({ ruleId: rule.id }).then(() => {
                  reload();
                });
              }}
            >
              {t("permission.revoke")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
