import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export interface FactoryLookupView {
  folder: string;
  definitionPath: string;
  contentHash: string;
  trustState: "untrusted" | "trusted" | "changed";
  trusted: boolean;
  changeSummary: {
    agents: string[];
    defaultAgent?: string;
    permissionMode?: string;
    templates: string[];
    judging: boolean;
    commandAgents: Array<{ name: string; command: string }>;
  };
  applied?: {
    droppedParts: string[];
    defaultAgent?: string;
    permissionMode?: string;
  };
}

export interface TrustDialogProps {
  lookup: FactoryLookupView;
  busy?: boolean;
  onTrust: () => void;
  onSkip: () => void;
}

/**
 * Shows what a factory definition would change and asks for trust (FR-064).
 */
export function TrustDialog({ lookup, busy, onTrust, onSkip }: TrustDialogProps): JSX.Element {
  const { t } = useTranslation();
  const summary = lookup.changeSummary;
  const changed = lookup.trustState === "changed";

  return (
    <div
      className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3"
      data-testid="factory-trust-dialog"
      role="region"
      aria-label={t("factory.trustTitle")}
    >
      <p className="font-medium text-[var(--ink)]">
        {changed ? t("factory.changedTitle") : t("factory.trustTitle")}
      </p>
      <p className="mt-1 text-sm text-[var(--ink2)]">
        {changed ? t("factory.changedBody") : t("factory.trustBody")}
      </p>
      <ul className="mt-2 list-inside list-disc text-sm text-[var(--ink2)]">
        {summary.agents.length > 0 ? (
          <li>{t("factory.summaryAgents", { agents: summary.agents.join(", ") })}</li>
        ) : null}
        {summary.defaultAgent ? (
          <li>{t("factory.summaryDefaultAgent", { agent: summary.defaultAgent })}</li>
        ) : null}
        {summary.permissionMode ? (
          <li>{t("factory.summaryMode", { mode: summary.permissionMode })}</li>
        ) : null}
        {summary.templates.length > 0 ? (
          <li>{t("factory.summaryTemplates", { templates: summary.templates.join(", ") })}</li>
        ) : null}
        {summary.judging ? <li>{t("factory.summaryJudging")}</li> : null}
        {summary.commandAgents.map((agent) => (
          <li key={agent.name}>
            {t("factory.summaryCommandAgent", {
              name: agent.name,
              command: agent.command,
            })}
          </li>
        ))}
      </ul>
      {lookup.applied?.droppedParts.length ? (
        <p className="mt-2 text-xs text-[var(--ink2)]">
          {t("factory.droppedByPolicy", { parts: lookup.applied.droppedParts.join(", ") })}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn ghost" disabled={busy} onClick={onSkip}>
          {t("factory.skip")}
        </button>
        <button type="button" className="btn primary" disabled={busy} onClick={onTrust}>
          {changed ? t("factory.trustAgain") : t("factory.trust")}
        </button>
      </div>
    </div>
  );
}
