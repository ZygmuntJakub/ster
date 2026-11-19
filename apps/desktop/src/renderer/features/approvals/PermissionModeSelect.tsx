import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ManagedBadge } from "../../components/ManagedBadge.js";

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
  const [allowedModes, setAllowedModes] = useState<string[] | null>(null);
  const [modesManaged, setModesManaged] = useState(false);

  useEffect(() => {
    void window.ster.app.info().then((info) => {
      const modesItem = info.effectivePolicy?.items.find(
        (item) => item.key === "permissions.modes",
      );
      if (Array.isArray(modesItem?.value)) {
        setAllowedModes(modesItem.value as string[]);
        setModesManaged(modesItem.managed);
      }
    });
  }, []);

  const modes = allowedModes ?? [...MODES];

  return (
    <label className="f inline-flex items-center gap-2 text-xs" data-testid="permission-mode">
      <span className="lbl mb-0 inline-flex items-center">
        {t("permission.modeLabel")}
        <ManagedBadge managed={modesManaged} />
      </span>
      <select
        value={mode}
        disabled={disabled}
        aria-label={t("permission.modeLabel")}
        onChange={(event) => {
          const next = event.target.value;
          // Update UI immediately so e2e / follow-up prompts do not race the IPC round-trip.
          onChanged?.(next);
          void window.ster.sessions.setPermissionMode({ sessionId, mode: next });
        }}
      >
        {modes.map((id) => (
          <option key={id} value={id}>
            {t(`permission.modes.${id}`, id)}
          </option>
        ))}
      </select>
    </label>
  );
}
