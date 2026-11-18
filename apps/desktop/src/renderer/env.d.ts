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
  agents: {
    list: () => Promise<unknown>;
    confirmFirstStart: (payload: { agentId: string }) => Promise<unknown>;
  };
  dialogs: {
    pickFolder: () => Promise<unknown>;
    pickAttachments: (payload: { sessionId: string }) => Promise<unknown>;
  };
  sessions: {
    create: (payload: {
      agentId: string;
      folderToken: string;
      permissionMode?: string;
    }) => Promise<unknown>;
    list: (filter?: unknown) => Promise<unknown>;
    get: (payload: { sessionId: string }) => Promise<unknown>;
    items: (payload: { sessionId: string; before?: number; limit?: number }) => Promise<unknown>;
    prompt: (payload: {
      sessionId: string;
      text: string;
      attachmentTokens?: string[];
    }) => Promise<unknown>;
    cancel: (payload: { sessionId: string }) => Promise<unknown>;
    resolveApproval: (payload: {
      approvalId: string;
      outcome: { optionId: string } | { cancelled: true };
    }) => Promise<unknown>;
    authMethods: (payload: { sessionId: string }) => Promise<unknown>;
    authenticate: (payload: { sessionId: string; methodId: string }) => Promise<unknown>;
    restart: (payload: { sessionId: string }) => Promise<unknown>;
    end: (payload: { sessionId: string }) => Promise<unknown>;
  };
  files: {
    openLocation: (payload: {
      sessionId: string;
      itemSeq: number;
      locationIndex: number;
    }) => Promise<unknown>;
  };
  links: {
    open: (payload: { sessionId: string; itemSeq: number; linkIndex: number }) => Promise<unknown>;
  };
  factory: Record<string, (payload?: unknown) => Promise<unknown>>;
  runs: Record<string, (payload?: unknown) => Promise<unknown>>;
  login: {
    terminal: {
      start: (payload: { sessionId: string; methodId: string }) => Promise<unknown>;
      input: (payload: { terminalToken: string; data: string }) => Promise<unknown>;
      resize: (payload: { terminalToken: string; cols: number; rows: number }) => Promise<unknown>;
    };
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
