/**
 * Fixed bridge surface from contracts/ipc.md (no zod — safe for sandbox preload).
 */
export const BRIDGE_SURFACE = {
  app: ["info"],
  settings: ["get", "set"],
  agents: [
    "list",
    "icon",
    "refreshRegistry",
    "planInstall",
    "install",
    "remove",
    "saveCustom",
    "deleteCustom",
    "confirmFirstStart",
  ],
  dialogs: ["pickFolder", "pickAttachments"],
  sessions: [
    "create",
    "list",
    "get",
    "items",
    "prompt",
    "cancel",
    "resolveApproval",
    "setPermissionMode",
    "setConfigOption",
    "rules",
    "revokeRule",
    "killCommand",
    "authMethods",
    "authenticate",
    "resume",
    "restart",
    "rename",
    "end",
    "delete",
  ],
  files: ["openLocation"],
  links: ["open"],
  factory: ["find", "trust", "revoke", "renderTemplate", "applied"],
  runs: ["list", "get", "rate", "judge", "export", "delete"],
  login: {
    terminal: ["start", "input", "resize"],
  },
  events: ["subscribe"],
} as const;

export type BridgeGroup = keyof typeof BRIDGE_SURFACE;

export const EVENT_CHANNEL = "ster:event";
export const INVOKE_CHANNEL = "ster:invoke";

/** Flattened `"group.method"` ids for the invoke channel allow-list. */
export function listBridgeMethods(): string[] {
  const flat = (group: string, methods: readonly string[]): string[] =>
    methods.map((method) => `${group}.${method}`);

  return [
    ...flat("app", BRIDGE_SURFACE.app),
    ...flat("settings", BRIDGE_SURFACE.settings),
    ...flat("agents", BRIDGE_SURFACE.agents),
    ...flat("dialogs", BRIDGE_SURFACE.dialogs),
    ...flat("sessions", BRIDGE_SURFACE.sessions),
    ...flat("files", BRIDGE_SURFACE.files),
    ...flat("links", BRIDGE_SURFACE.links),
    ...flat("factory", BRIDGE_SURFACE.factory),
    ...flat("runs", BRIDGE_SURFACE.runs),
    ...flat("login.terminal", BRIDGE_SURFACE.login.terminal),
    ...flat("events", BRIDGE_SURFACE.events),
  ].sort();
}

/**
 * Reject calls that do not come from the application's own top-level frame.
 */
export function isTrustedSender(event: {
  sender: { mainFrame: unknown };
  senderFrame: unknown;
}): boolean {
  return event.senderFrame != null && event.senderFrame === event.sender.mainFrame;
}
