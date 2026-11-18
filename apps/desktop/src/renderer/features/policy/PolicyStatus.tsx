import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

interface PolicyProblem {
  path: string;
  message: string;
}

/**
 * Invalid-policy banner and status surface (US10). History remains readable;
 * new sessions are blocked until policy is fixed and the app restarts.
 */
export function PolicyStatus(): JSX.Element | null {
  const { t } = useTranslation();
  const [state, setState] = useState<string>("absent");
  const [problems, setProblems] = useState<PolicyProblem[]>([]);

  useEffect(() => {
    void window.ster.app.info().then((info) => {
      setState(info.policyState);
      setProblems(info.policyProblems ?? []);
    });
  }, []);

  if (state !== "invalid") {
    return null;
  }

  return (
    <div
      className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3"
      data-testid="policy-invalid-banner"
      role="alert"
    >
      <p className="font-medium text-[var(--ink)]">{t("policy.invalidTitle")}</p>
      <p className="mt-1 text-sm text-[var(--ink2)]">{t("policy.invalidBody")}</p>
      {problems.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-xs text-[var(--ink2)]">
          {problems.map((problem) => (
            <li key={`${problem.path}:${problem.message}`}>
              {problem.path ? `${problem.path}: ` : ""}
              {problem.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Compact readiness note when an agent is blocked by policy.
 */
export function BlockedAgentNotice(): JSX.Element {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-[var(--ink2)]" data-testid="agent-blocked-notice">
      {t("policy.agentBlocked")}
    </p>
  );
}
