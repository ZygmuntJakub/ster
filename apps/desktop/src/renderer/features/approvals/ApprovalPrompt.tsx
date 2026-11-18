import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { ApprovalView } from "../../app/stores/sessions.js";

export interface ApprovalPromptProps {
  approval: ApprovalView;
  onResolved?: () => void;
}

function subjectLabel(subject: unknown): string {
  if (typeof subject === "string") {
    return subject;
  }
  if (!subject || typeof subject !== "object") {
    return "";
  }
  const record = subject as Record<string, unknown>;
  if (typeof record["title"] === "string") {
    return record["title"];
  }
  if (typeof record["reason"] === "string") {
    return record["reason"];
  }
  if (typeof record["path"] === "string") {
    return record["path"];
  }
  return JSON.stringify(subject);
}

/**
 * Agent approvals: bar above composer. Client-guard: blocking dialog (R20).
 */
export function ApprovalPrompt({ approval, onResolved }: ApprovalPromptProps): JSX.Element {
  const { t } = useTranslation();
  const isGuard = approval.source === "client-guard";

  const resolve = (outcome: { optionId: string } | { cancelled: true }): void => {
    void window.ster.sessions.resolveApproval({ approvalId: approval.id, outcome }).then(() => {
      onResolved?.();
    });
  };

  const body = (
    <>
      <div className="min-w-0 grow">
        <p className="lbl">{isGuard ? t("approval.guardTitle") : t("approval.title")}</p>
        <p className="text-sm text-[var(--ink)]">{subjectLabel(approval.subject)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {approval.options.map((option) => (
          <button
            key={option.optionId}
            type="button"
            className={option.kind === "allow_once" ? "btn primary" : "btn"}
            data-option-id={option.optionId}
            onClick={() => {
              resolve({ optionId: option.optionId });
            }}
          >
            {option.optionId === "ster.remember" ? t("permission.remember") : option.name}
          </button>
        ))}
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            resolve({ cancelled: true });
          }}
        >
          {t("approval.cancel")}
        </button>
      </div>
    </>
  );

  if (isGuard) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-lg rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-lg"
        >
          <div className="flex flex-col gap-3">{body}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="approval-bar flex items-start gap-3 border-t border-amber-500/40 bg-amber-500/10 px-3 py-2">
      {body}
    </div>
  );
}
