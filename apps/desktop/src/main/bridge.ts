import { isSterError, type Core, type CoreEvent } from "@ster/core";
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  EVENT_CHANNEL,
  INVOKE_CHANNEL,
  isTrustedSender,
  listBridgeMethods,
  validateBridgePayload,
} from "../shared/bridge.js";
import type { CoreHost } from "./core-host.js";

const allowedMethods = new Set(listBridgeMethods());

export interface BridgeError {
  code: string;
  details?: Readonly<Record<string, unknown>>;
}

export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: BridgeError };

export { isTrustedSender };

function fail(code: string, details?: Readonly<Record<string, unknown>>): BridgeResult<never> {
  return details === undefined
    ? { ok: false, error: { code } }
    : { ok: false, error: { code, details } };
}

function ok<T>(value: T): BridgeResult<T> {
  return { ok: true, value };
}

async function handleMethod(
  host: CoreHost,
  method: string,
  payload: unknown,
): Promise<BridgeResult<unknown>> {
  const core: Core = host.core;

  switch (method) {
    case "app.info":
      return ok({
        brand: host.brand,
        version: host.version,
        platform: process.platform,
        language: core.settings.get().language,
        policyState: core.policy.state,
      });
    case "settings.get":
      return ok(core.settings.get());
    case "settings.set": {
      const patch = payload as {
        language?: string;
        defaultPermissionMode?: string;
        defaultAgentId?: string | null;
        theme?: "system" | "light" | "dark";
      };
      const next: Parameters<Core["settings"]["set"]>[0] = {};
      if (patch.language !== undefined) {
        next.language = patch.language;
      }
      if (patch.defaultPermissionMode !== undefined) {
        next.defaultPermissionMode = patch.defaultPermissionMode;
      }
      if (patch.theme !== undefined) {
        next.theme = patch.theme;
      }
      if (patch.defaultAgentId === null) {
        Object.assign(next, { defaultAgentId: undefined });
      } else if (patch.defaultAgentId !== undefined) {
        next.defaultAgentId = patch.defaultAgentId;
      }
      return ok(core.settings.set(next));
    }
    case "events.subscribe":
      // Subscription is established from preload via the event channel; invoke is a no-op ack.
      return ok({ subscribed: true });
    case "agents.list":
      return ok(await core.agents.list());
    case "sessions.list":
      return ok(await core.sessions.list());
    default:
      return fail("invalid-argument", { method, reason: "not-implemented" });
  }
}

/**
 * Register the validating IPC bridge (contracts/ipc.md).
 */
export function registerBridge(host: CoreHost): () => void {
  const onInvoke = async (
    event: IpcMainInvokeEvent,
    method: unknown,
    payload: unknown,
  ): Promise<BridgeResult<unknown>> => {
    if (!isTrustedSender(event)) {
      return fail("invalid-argument", { reason: "untrusted-sender" });
    }
    if (typeof method !== "string" || !allowedMethods.has(method)) {
      return fail("invalid-argument", { reason: "unknown-method", method });
    }
    try {
      const validated = validateBridgePayload(method, payload);
      return await handleMethod(host, method, validated);
    } catch (error) {
      if (isSterError(error)) {
        return fail(error.code, error.details);
      }
      return fail("invalid-argument", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  ipcMain.handle(INVOKE_CHANNEL, onInvoke);

  const unsubscribe = host.core.events.subscribe((coreEvent: CoreEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(EVENT_CHANNEL, coreEvent);
      }
    }
  });

  return () => {
    ipcMain.removeHandler(INVOKE_CHANNEL);
    unsubscribe();
  };
}
