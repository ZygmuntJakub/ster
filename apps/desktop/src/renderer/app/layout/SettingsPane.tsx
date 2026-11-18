import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { PermissionSettings } from "../../features/settings/PermissionSettings.js";
import { applyTheme, getSettings, setSettings, type ThemePreference } from "../stores/settings.js";

export interface SettingsPaneProps {
  onLanguageChange: (language: string) => void;
}

/**
 * Settings entry: language, theme, and default permission mode.
 */
export function SettingsPane({ onLanguageChange }: SettingsPaneProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const settings = getSettings();

  return (
    <section className="conv col px-6 py-4" aria-label={t("settings.title")}>
      <h1 className="title mb-4">{t("settings.title")}</h1>
      <div className="flex max-w-md flex-col gap-4">
        <label className="f">
          {t("settings.language")}
          <select
            value={settings.language}
            onChange={(event) => {
              const language = event.target.value;
              setSettings({ ...getSettings(), language });
              onLanguageChange(language);
              void window.ster.settings.set({ language });
            }}
          >
            <option value="en">English</option>
            <option value="pl">Polski</option>
          </select>
        </label>
        <label className="f">
          {t("settings.theme")}
          <select
            value={settings.theme}
            onChange={(event) => {
              const theme = event.target.value as ThemePreference;
              setSettings({ ...getSettings(), theme });
              applyTheme(theme);
              void window.ster.settings.set({ theme });
            }}
          >
            <option value="system">{t("settings.themeSystem")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </label>
        <PermissionSettings />
        <p className="faint text-xs mono">i18n: {i18n.language}</p>
      </div>
    </section>
  );
}
