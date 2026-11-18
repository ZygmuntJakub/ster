import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  BRIDGE_SURFACE,
  EVENT_CHANNEL,
  INVOKE_CHANNEL,
  listBridgeMethods,
} from "../shared/bridge-surface.js";

type BridgeListener = (event: unknown) => void;

async function invoke(method: string, payload?: unknown): Promise<unknown> {
  const result = (await ipcRenderer.invoke(INVOKE_CHANNEL, method, payload)) as {
    ok: boolean;
    value?: unknown;
    error?: { code: string; details?: Record<string, unknown> };
  };
  if (!result.ok) {
    const error = new Error(result.error?.code ?? "invalid-argument") as Error & {
      code: string;
      details?: Record<string, unknown>;
    };
    error.code = result.error?.code ?? "invalid-argument";
    if (result.error?.details !== undefined) {
      error.details = result.error.details;
    }
    throw error;
  }
  return result.value;
}

function methodProxy(prefix: string, methods: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const method of methods) {
    const id = `${prefix}.${method}`;
    out[method] = (...args: unknown[]) => invoke(id, args[0]);
  }
  return out;
}

function buildSterApi(): Record<string, unknown> {
  const api: Record<string, unknown> = {
    app: methodProxy("app", BRIDGE_SURFACE.app),
    settings: methodProxy("settings", BRIDGE_SURFACE.settings),
    agents: methodProxy("agents", BRIDGE_SURFACE.agents),
    dialogs: methodProxy("dialogs", BRIDGE_SURFACE.dialogs),
    sessions: methodProxy("sessions", BRIDGE_SURFACE.sessions),
    files: methodProxy("files", BRIDGE_SURFACE.files),
    links: methodProxy("links", BRIDGE_SURFACE.links),
    factory: methodProxy("factory", BRIDGE_SURFACE.factory),
    runs: methodProxy("runs", BRIDGE_SURFACE.runs),
    login: {
      terminal: methodProxy("login.terminal", BRIDGE_SURFACE.login.terminal),
    },
    events: {
      subscribe: (listener: BridgeListener) => {
        const handler = (_event: IpcRendererEvent, payload: unknown) => {
          listener(payload);
        };
        ipcRenderer.on(EVENT_CHANNEL, handler);
        void invoke("events.subscribe");
        return () => {
          ipcRenderer.removeListener(EVENT_CHANNEL, handler);
        };
      },
    },
  };

  Object.defineProperty(api, "__methods", {
    value: listBridgeMethods(),
    enumerable: false,
  });

  return api;
}

contextBridge.exposeInMainWorld("ster", buildSterApi());
