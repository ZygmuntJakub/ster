import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

export interface InstallPlanView {
  id: string;
  agentId: string;
  version: string;
  source: string;
  verified: boolean;
  lines: Array<{ label: string; sizeBytes?: number }>;
  scriptsAllowed: boolean;
}

export interface InstallDialogProps {
  plan: InstallPlanView;
  onClose: () => void;
  onInstalled: () => void;
}

/**
 * Install confirmation: source, verification, optional scripts (FR-020/FR-077).
 */
export function InstallDialog({ plan, onClose, onInstalled }: InstallDialogProps): JSX.Element {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-lg"
        data-testid="install-dialog"
      >
        <h2 className="title text-lg">{t("agents.installTitle")}</h2>
        <p className="mt-1 text-sm text-[var(--ink2)]">
          {plan.agentId} @ {plan.version}
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {plan.lines.map((line) => (
            <li key={line.label}>{line.label}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm" data-testid="install-verified">
          {plan.verified ? t("agents.verified") : t("agents.unverified")}
        </p>
        <p className="faint mono mt-1 text-xs">{plan.source}</p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
            {t("agents.cancel")}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void window.ster.agents
                .install({ planId: plan.id })
                .then(() => {
                  onInstalled();
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : String(err));
                  setBusy(false);
                });
            }}
          >
            {busy ? t("agents.installing") : t("agents.confirmInstall")}
          </button>
        </div>
      </div>
    </div>
  );
}
