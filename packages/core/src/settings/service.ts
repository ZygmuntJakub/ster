import type { Store } from "../store/store.js";
import { SterError } from "../errors.js";

/**
 * User settings (data-model.md `Settings`).
 * Values controlled by policy are read-only; that gating arrives with US10.
 */

export type ThemePreference = "system" | "light" | "dark";

export interface CustomAgentSetting {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface Settings {
  language: string;
  defaultPermissionMode: string;
  defaultAgentId?: string;
  customAgents: CustomAgentSetting[];
  theme: ThemePreference;
}

export interface SettingsService {
  get(): Settings;
  set(patch: Partial<Settings>): Settings;
}

const SETTINGS_KEY = "settings";

const DEFAULT_SETTINGS: Settings = {
  language: "en",
  defaultPermissionMode: "always-ask",
  customAgents: [],
  theme: "system",
};

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function parseSettings(raw: string | null): Settings {
  if (!raw) {
    return { ...DEFAULT_SETTINGS, customAgents: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const settings: Settings = {
      language:
        typeof parsed.language === "string" && parsed.language.length > 0
          ? parsed.language
          : DEFAULT_SETTINGS.language,
      defaultPermissionMode:
        typeof parsed.defaultPermissionMode === "string" && parsed.defaultPermissionMode.length > 0
          ? parsed.defaultPermissionMode
          : DEFAULT_SETTINGS.defaultPermissionMode,
      customAgents: Array.isArray(parsed.customAgents) ? parsed.customAgents : [],
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
    };
    if (typeof parsed.defaultAgentId === "string" && parsed.defaultAgentId.length > 0) {
      settings.defaultAgentId = parsed.defaultAgentId;
    }
    return settings;
  } catch (cause) {
    throw new SterError("invalid-argument", "Stored settings are corrupt", {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export interface CreateSettingsServiceOptions {
  store: Store;
  /** Keys that policy manages and that set() must refuse to change. */
  managedKeys?: ReadonlyArray<keyof Settings>;
  /**
   * Overrides applied only when no settings document exists yet
   * (first launch — e.g. system-derived language).
   */
  defaults?: Partial<Settings>;
}

/**
 * Persist settings in the Store under a single JSON document.
 */
export function createSettingsService(options: CreateSettingsServiceOptions): SettingsService {
  const managed = new Set(options.managedKeys ?? []);

  const read = (): Settings => parseSettings(options.store.getSetting(SETTINGS_KEY));

  const write = (settings: Settings): Settings => {
    options.store.setSetting(SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  };

  // Ensure defaults exist (first launch can seed language from the OS locale).
  if (options.store.getSetting(SETTINGS_KEY) === null) {
    const seed: Settings = {
      ...DEFAULT_SETTINGS,
      ...options.defaults,
      customAgents: options.defaults?.customAgents ?? [],
    };
    if (options.defaults?.defaultAgentId !== undefined) {
      seed.defaultAgentId = options.defaults.defaultAgentId;
    }
    write(seed);
  }

  return {
    get() {
      return read();
    },
    set(patch) {
      const current = read();
      for (const key of Object.keys(patch) as Array<keyof Settings>) {
        if (managed.has(key) && patch[key] !== undefined) {
          throw new SterError("blocked-by-policy", `Setting ${key} is managed by policy`);
        }
      }
      const next: Settings = {
        language: patch.language ?? current.language,
        defaultPermissionMode: patch.defaultPermissionMode ?? current.defaultPermissionMode,
        customAgents: patch.customAgents ?? current.customAgents,
        theme: patch.theme ?? current.theme,
      };
      const agentId = patch.defaultAgentId ?? current.defaultAgentId;
      if (agentId !== undefined) {
        next.defaultAgentId = agentId;
      } else {
        delete next.defaultAgentId;
      }
      if (patch.defaultAgentId === undefined && "defaultAgentId" in patch) {
        delete next.defaultAgentId;
      }
      return write(next);
    },
  };
}
