import type { CoreEvent } from "@ster/core";
import { EVENT_CHANNEL } from "../shared/bridge.js";

export interface EventForwarder {
  /** Handle one core event (may buffer for coalescing). */
  publish(event: CoreEvent): void;
  dispose(): void;
}

type WindowLike = {
  isDestroyed(): boolean;
  webContents: { send(channel: string, payload: unknown): void };
};

const STREAM_ITEM_KINDS = new Set(["agent-message", "agent-thought"]);

/**
 * Forward core events to all windows, coalescing streamed text item updates
 * to at most one send per animation frame per session (research.md R18).
 */
export function createEventForwarder(getWindows: () => WindowLike[]): EventForwarder {
  const pendingBySession = new Map<string, CoreEvent>();
  const frameScheduled = new Set<string>();
  let disposed = false;

  const send = (event: CoreEvent): void => {
    for (const win of getWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(EVENT_CHANNEL, event);
      }
    }
  };

  const flush = (sessionId: string): void => {
    frameScheduled.delete(sessionId);
    const event = pendingBySession.get(sessionId);
    pendingBySession.delete(sessionId);
    if (event && !disposed) {
      send(event);
    }
  };

  const schedule = (sessionId: string): void => {
    if (frameScheduled.has(sessionId)) {
      return;
    }
    frameScheduled.add(sessionId);
    setTimeout(() => {
      flush(sessionId);
    }, 16);
  };

  const isStreamUpdate = (event: CoreEvent): boolean => {
    if (event.type !== "item.updated") {
      return false;
    }
    const patch = event.patch;
    if (typeof patch !== "object") {
      return false;
    }
    // Streamed text patches carry kind hints when present; coalesce all item.updated
    // that look like text growth. Unknown patches still coalesce safely per session.
    if ("kind" in patch && typeof patch.kind === "string") {
      return STREAM_ITEM_KINDS.has(patch.kind);
    }
    return "text" in patch || "payload" in patch;
  };

  return {
    publish(event) {
      if (disposed) {
        return;
      }
      if (event.type === "item.updated" && "sessionId" in event && isStreamUpdate(event)) {
        pendingBySession.set(event.sessionId, event);
        schedule(event.sessionId);
        return;
      }
      // Flush any buffered stream update for this session before other events.
      if ("sessionId" in event && pendingBySession.has(event.sessionId)) {
        flush(event.sessionId);
      }
      send(event);
    },
    dispose() {
      disposed = true;
      for (const sessionId of [...pendingBySession.keys()]) {
        flush(sessionId);
      }
    },
  };
}
