import { z } from "zod";

/**
 * Fixed bridge surface from contracts/ipc.md.
 * Nested keys are the only functions exposed on `window.ster`.
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
  factory: ["find", "trust", "revoke", "renderTemplate"],
  runs: ["list", "get", "rate", "judge", "export", "delete"],
  login: {
    terminal: ["start", "input", "resize"],
  },
  events: ["subscribe"],
} as const;

export type BridgeGroup = keyof typeof BRIDGE_SURFACE;

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

export const EVENT_CHANNEL = "ster:event";
export const INVOKE_CHANNEL = "ster:invoke";

export const settingsPatchSchema = z
  .object({
    language: z.string().min(1).optional(),
    defaultPermissionMode: z.string().min(1).optional(),
    defaultAgentId: z.string().min(1).nullable().optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
  })
  .strict();

export const emptySchema = z.undefined();

export const bridgePayloadSchemas: Record<string, z.ZodType> = {
  "app.info": emptySchema,
  "settings.get": emptySchema,
  "settings.set": settingsPatchSchema,
  "events.subscribe": emptySchema,
};

/**
 * Reject calls that do not come from the application's own top-level frame.
 */
export function isTrustedSender(event: {
  sender: { mainFrame: unknown };
  senderFrame: unknown;
}): boolean {
  return event.senderFrame != null && event.senderFrame === event.sender.mainFrame;
}

/**
 * Validate an invoke payload for a known method. Unknown methods fail closed.
 */
export function validateBridgePayload(method: string, payload: unknown): unknown {
  const schema = bridgePayloadSchemas[method];
  if (!schema) {
    // Methods without a dedicated schema yet must still not accept arbitrary objects.
    if (payload !== undefined) {
      throw new Error(`Unexpected payload for ${method}`);
    }
    return undefined;
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Invalid payload for ${method}`);
  }
  return result.data;
}
