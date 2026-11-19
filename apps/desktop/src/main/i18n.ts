/**
 * Main-process i18n for menus, native dialogs, and confirmations (T125).
 * Shares the same EN/PL catalogs as the renderer.
 */
import { createInstance, type i18n as I18nInstance } from "i18next";
import en from "../renderer/i18n/en.json" with { type: "json" };
import pl from "../renderer/i18n/pl.json" with { type: "json" };
import { isAppLanguage, type AppLanguage } from "./language.js";

const resources = {
  en: { translation: en },
  pl: { translation: pl },
} as const;

let mainI18n: I18nInstance | null = null;

/**
 * Initialize (or re-init) the main-process i18n instance.
 */
export async function setupMainI18n(language: string = "en"): Promise<I18nInstance> {
  const lng: AppLanguage = isAppLanguage(language) ? language : "en";
  if (!mainI18n) {
    mainI18n = createInstance();
    await mainI18n.init({
      resources,
      lng,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
    });
  } else {
    await mainI18n.changeLanguage(lng);
  }
  return mainI18n;
}

export function t(key: string, options?: Record<string, string | number | boolean>): string {
  if (!mainI18n) {
    return key;
  }
  if (options === undefined) {
    return mainI18n.t(key);
  }
  return mainI18n.t(key, options);
}

export async function setMainLanguage(language: string): Promise<void> {
  await setupMainI18n(language);
}

export function getMainLanguage(): string {
  return mainI18n?.language ?? "en";
}
