/// <reference types="vite/client" />

type SterSettings = {
  language: string;
  defaultPermissionMode: string;
  defaultAgentId?: string;
  customAgents: unknown[];
  theme: "system" | "light" | "dark";
};

type SterApi = {
  app: {
    info: () => Promise<{
      brand: { productName: string };
      version: string;
      platform: string;
      language: string;
      policyState: string;
    }>;
  };
  settings: {
    get: () => Promise<SterSettings>;
    set: (patch: Partial<SterSettings>) => Promise<SterSettings>;
  };
  agents: Record<string, (...args: unknown[]) => Promise<unknown>>;
  dialogs: Record<string, (...args: unknown[]) => Promise<unknown>>;
  sessions: Record<string, (...args: unknown[]) => Promise<unknown>>;
  files: Record<string, (...args: unknown[]) => Promise<unknown>>;
  links: Record<string, (...args: unknown[]) => Promise<unknown>>;
  factory: Record<string, (...args: unknown[]) => Promise<unknown>>;
  runs: Record<string, (...args: unknown[]) => Promise<unknown>>;
  login: {
    terminal: Record<string, (...args: unknown[]) => Promise<unknown>>;
  };
  events: {
    subscribe: (listener: (event: unknown) => void) => () => void;
  };
};

declare global {
  interface Window {
    ster: SterApi;
  }
}

export {};
