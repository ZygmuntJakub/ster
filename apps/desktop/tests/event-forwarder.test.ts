import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoreEvent } from "@ster/core";
import { createEventForwarder } from "../src/main/event-forwarder.js";

describe("event forwarder", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces streamed item.updated events per session", () => {
    vi.useFakeTimers();
    const send = vi.fn<(payload: unknown) => void>();
    const forwarder = createEventForwarder(() => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (_channel: string, payload: unknown) => {
            send(payload);
          },
        },
      },
    ]);

    const first: CoreEvent = {
      type: "item.updated",
      sessionId: "s1",
      seq: 1,
      patch: { text: "a" },
      at: new Date().toISOString(),
      n: 1,
    };
    const second: CoreEvent = {
      type: "item.updated",
      sessionId: "s1",
      seq: 1,
      patch: { text: "ab" },
      at: new Date().toISOString(),
      n: 2,
    };

    forwarder.publish(first);
    forwarder.publish(second);

    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      type: "item.updated",
      patch: { text: "ab" },
    });

    forwarder.dispose();
  });
});
