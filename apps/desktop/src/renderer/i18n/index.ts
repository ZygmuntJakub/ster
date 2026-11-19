import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json" with { type: "json" };
import pl from "./pl.json" with { type: "json" };

export const resources = {
  en: { translation: en },
  pl: { translation: pl },
} as const;

export type AppLanguage = keyof typeof resources;

/**
 * Typed i18n bootstrap for the renderer (EN/PL key parity enforced by check-i18n).
 */
export async function setupI18n(language: AppLanguage = "en"): Promise<typeof i18n> {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
    });
  } else {
    await i18n.changeLanguage(language);
  }
  return i18n;
}

export function sterErrorMessage(code: string): string {
  const key = `errors.${code}`;
  if (i18n.exists(key)) {
    return i18n.t(key);
  }
  return i18n.t("errors.invalid-argument");
}

export { i18n };
