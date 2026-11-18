import type { JSX } from "react";
import { useTranslation } from "react-i18next";

const MODES = ["always-ask", "ask-with-rules", "auto-approve-reads"] as const;

export interface PermissionModeSelectProps {
  sessionId: string;
  mode: string;
  disabled?: boolean;
  onChanged?: (mode: string) => void;
}

/**
 * Per-session permission mode selector (FR-012 / FR-013).
 */
export function PermissionModeSelect({
  sessionId,
  mode,
  disabled,
  onChanged,
}: PermissionModeSelectProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <label className="f inline-flex items-center gap-2 text-xs" data-testid="permission-mode">
      <span className="lbl mb-0">{t("permission.modeLabel")}</span>
      <select
        value={mode}
        disabled={disabled}
        aria-label={t("permission.modeLabel")}
        onChange={(event) => {
          const next = event.target.value;
          void window.ster.sessions.setPermissionMode({ sessionId, mode: next }).then(() => {
            onChanged?.(next);
          });
        }}
      >
        {MODES.map((id) => (
          <option key={id} value={id}>
            {t(`permission.modes.${id}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
