import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { getSettings, setSettings } from "../../app/stores/settings.js";

const MODES = ["always-ask", "ask-with-rules", "auto-approve-reads"] as const;

/**
 * Default permission mode + confinement statement (FR-015).
 */
export function PermissionSettings(): JSX.Element {
  const { t } = useTranslation();
  const settings = getSettings();

  return (
    <div className="flex flex-col gap-3" data-testid="permission-settings">
      <label className="f">
        {t("permission.defaultMode")}
        <select
          value={settings.defaultPermissionMode}
          onChange={(event) => {
            const defaultPermissionMode = event.target.value;
            setSettings({ ...getSettings(), defaultPermissionMode });
            void window.ster.settings.set({ defaultPermissionMode });
          }}
        >
          {MODES.map((id) => (
            <option key={id} value={id}>
              {t(`permission.modes.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
        <p className="lbl">{t("permission.confinementTitle")}</p>
        <p className="mt-1 text-sm text-[var(--ink2)]">{t("permission.confinementBody")}</p>
      </div>
    </div>
  );
}
