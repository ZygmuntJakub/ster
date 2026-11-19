import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { getSettings, setSettings } from "../../app/stores/settings.js";

export interface LanguageSettingsProps {
  onLanguageChange: (language: string) => void;
}

/**
 * Live language switcher — persists immediately and does not require a restart (FR-036).
 */
export function LanguageSettings({ onLanguageChange }: LanguageSettingsProps): JSX.Element {
  const { t } = useTranslation();
  const settings = getSettings();

  return (
    <label className="f" data-testid="language-setting">
      {t("settings.language")}
      <select
        value={settings.language}
        aria-label={t("settings.language")}
        onChange={(event) => {
          const language = event.target.value;
          setSettings({ ...getSettings(), language });
          onLanguageChange(language);
          void window.ster.settings.set({ language });
        }}
      >
        <option value="en">{t("settings.languageEn")}</option>
        <option value="pl">{t("settings.languagePl")}</option>
      </select>
    </label>
  );
}
