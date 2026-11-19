export type ThemePreference = "system" | "light" | "dark";

export interface AppSettings {
  language: string;
  theme: ThemePreference;
  defaultPermissionMode: string;
  defaultAgentId?: string;
}

type Listener = () => void;

let settings: AppSettings = {
  language: "en",
  theme: "system",
  defaultPermissionMode: "always-ask",
};

const listeners = new Set<Listener>();

export function getSettings(): AppSettings {
  return settings;
}

export function setSettings(next: AppSettings): void {
  settings = next;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Apply theme to the document root from Settings.theme.
 */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset["theme"] = dark ? "dark" : "light";
    return;
  }
  root.dataset["theme"] = theme;
}
