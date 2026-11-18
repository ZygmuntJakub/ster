import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ManagedBadge } from "../../components/ManagedBadge.js";
import { getSettings, setSettings } from "../../app/stores/settings.js";

const MODES = ["always-ask", "ask-with-rules", "auto-approve-reads"] as const;

/**
 * Default permission mode + confinement statement (FR-015).
 */
export function PermissionSettings(): JSX.Element {
  const { t } = useTranslation();
  const settings = getSettings();
  const [managed, setManaged] = useState(false);
  const [allowedModes, setAllowedModes] = useState<string[] | null>(null);

  useEffect(() => {
    void window.ster.app.info().then((info) => {
      setManaged((info.managedSettings ?? []).includes("defaultPermissionMode"));
      const modesItem = info.effectivePolicy?.items.find(
        (item) => item.key === "permissions.modes",
      );
      if (Array.isArray(modesItem?.value)) {
        setAllowedModes(modesItem.value as string[]);
      }
    });
  }, []);

  const modes = allowedModes ?? [...MODES];

  return (
    <div className="flex flex-col gap-3" data-testid="permission-settings">
      <label className="f">
        <span className="inline-flex items-center">
          {t("permission.defaultMode")}
          <ManagedBadge managed={managed} />
        </span>
        <select
          value={settings.defaultPermissionMode}
          disabled={managed}
          data-managed={managed ? "true" : "false"}
          onChange={(event) => {
            const defaultPermissionMode = event.target.value;
            setSettings({ ...getSettings(), defaultPermissionMode });
            void window.ster.settings.set({ defaultPermissionMode });
          }}
        >
          {modes.map((id) => (
            <option key={id} value={id}>
              {t(`permission.modes.${id}`, id)}
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
