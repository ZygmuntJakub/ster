import { describe, expect, it, vi } from "vitest";
import { attachEventConsumers } from "../../src/events/consumers.js";
import { createEventStream } from "../../src/events/stream.js";
import { createLogger, type LogRecord } from "../../src/log.js";

describe("attachEventConsumers", () => {
  it("delivers events to every consumer", () => {
    const stream = createEventStream();
    const seen: string[] = [];
    attachEventConsumers(
      stream,
      [
        {
          id: "a",
          onEvent: (event) => {
            seen.push(`a:${event.type}`);
          },
        },
        {
          id: "b",
          onEvent: (event) => {
            seen.push(`b:${event.type}`);
          },
        },
      ],
      createLogger({ sink: () => undefined }),
    );

    stream.publish({ type: "agent.changed", agentId: "x" });
    expect(seen).toEqual(["a:agent.changed", "b:agent.changed"]);
  });

  it("logs sync failures and continues to later consumers", () => {
    const records: LogRecord[] = [];
    const stream = createEventStream();
    const second = vi.fn();
    attachEventConsumers(
      stream,
      [
        {
          id: "bad",
          onEvent: () => {
            throw new Error("boom");
          },
        },
        { id: "ok", onEvent: second },
      ],
      createLogger({
        sink: (record) => {
          records.push(record);
        },
      }),
    );

    stream.publish({ type: "agent.changed", agentId: "x" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(records.some((r) => r.level === "error" && r.fields?.["consumerId"] === "bad")).toBe(
      true,
    );
  });

  it("logs async failures without rejecting publish", async () => {
    const records: LogRecord[] = [];
    const stream = createEventStream();
    attachEventConsumers(
      stream,
      [
        {
          id: "async-bad",
          onEvent: async () => {
            await Promise.resolve();
            throw new Error("later");
          },
        },
      ],
      createLogger({
        sink: (record) => {
          records.push(record);
        },
      }),
    );

    stream.publish({ type: "agent.changed", agentId: "x" });
    await vi.waitFor(() => {
      expect(records.some((r) => r.fields?.["consumerId"] === "async-bad")).toBe(true);
    });
  });
});
