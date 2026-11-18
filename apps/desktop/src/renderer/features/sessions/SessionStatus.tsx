import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export interface SessionStatusProps {
  status: string;
  failureReason?: string;
  onRestart?: () => void;
}

/**
 * Error / restart banner for failed sessions.
 */
export function SessionStatus({
  status,
  failureReason,
  onRestart,
}: SessionStatusProps): JSX.Element | null {
  const { t } = useTranslation();
  if (status !== "failed") {
    return null;
  }
  return (
    <div className="banner flex items-center gap-3 border-b border-[var(--line)] bg-[var(--danger-soft)] px-3 py-2 text-sm">
      <div className="grow">
        <p className="font-medium text-[var(--danger)]">{t("session.failedTitle")}</p>
        {failureReason ? <p className="text-[var(--ink2)]">{failureReason}</p> : null}
      </div>
      {onRestart ? (
        <button type="button" className="btn" onClick={onRestart}>
          {t("session.restart")}
        </button>
      ) : null}
    </div>
  );
}
