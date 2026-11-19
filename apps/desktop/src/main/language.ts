/**
 * First-launch language selection from the system locale (FR-036).
 * Supported UI languages are English and Polish; everything else falls back to English.
 */

export const SUPPORTED_APP_LANGUAGES = ["en", "pl"] as const;

export type AppLanguage = (typeof SUPPORTED_APP_LANGUAGES)[number];

export function isAppLanguage(value: string): value is AppLanguage {
  return (SUPPORTED_APP_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Map a BCP-47 / OS locale string to an app language.
 * Matches on the primary language subtag (`pl-PL` → `pl`).
 */
export function resolveAppLanguage(locale: string): AppLanguage {
  const primary = locale.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
  if (primary === "pl") {
    return "pl";
  }
  if (primary === "en") {
    return "en";
  }
  return "en";
}
