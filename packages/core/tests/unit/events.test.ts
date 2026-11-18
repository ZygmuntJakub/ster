import { describe, expect, it, vi } from "vitest";
import { createEventStream, type CoreEvent } from "../../src/events/stream.js";

describe("createEventStream", () => {
  it("assigns per-session monotonic n and at", () => {
    const stream = createEventStream({
      now: () => new Date("2026-11-18T12:00:00.000Z"),
    });
    const a1 = stream.publish({
      type: "session.created",
      sessionId: "s1",
      session: {
        id: "s1",
        agentId: "mock",
        title: "One",
        status: "idle",
        cwd: "/tmp",
        lastActivityAt: "2026-11-18T12:00:00.000Z",
      },
    });
    const a2 = stream.publish({ type: "session.status", sessionId: "s1" });
    const b1 = stream.publish({ type: "session.status", sessionId: "s2" });

    expect(a1.n).toBe(1);
    expect(a2.n).toBe(2);
    expect(b1.n).toBe(1);
    expect(a1.at).toBe("2026-11-18T12:00:00.000Z");
  });

  it("delivers events in publish order per session", () => {
    const stream = createEventStream();
    const seen: number[] = [];
    stream.subscribe((event) => {
      if (event.type === "session.status") {
        seen.push(event.n);
      }
    });

    stream.publish({ type: "session.status", sessionId: "s1" });
    stream.publish({ type: "session.status", sessionId: "s1" });
    stream.publish({ type: "session.status", sessionId: "s1" });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("filters by sessionId and type", () => {
    const stream = createEventStream();
    const events: CoreEvent[] = [];
    stream.subscribe(
      (event) => {
        events.push(event);
      },
      { sessionId: "s1", types: ["item.appended"] },
    );

    stream.publish({ type: "session.status", sessionId: "s1" });
    stream.publish({
      type: "item.appended",
      sessionId: "s2",
      item: {
        sessionId: "s2",
        seq: 1,
        kind: "agent-message",
        runId: "r1",
        createdAt: "2026-11-18T12:00:00.000Z",
        payload: {},
      },
    });
    stream.publish({
      type: "item.appended",
      sessionId: "s1",
      item: {
        sessionId: "s1",
        seq: 1,
        kind: "agent-message",
        runId: "r1",
        createdAt: "2026-11-18T12:00:00.000Z",
        payload: {},
      },
    });

    expect(events).toHaveLength(1);
    const only = events[0];
    expect(only?.type).toBe("item.appended");
    if (only && "sessionId" in only) {
      expect(only.sessionId).toBe("s1");
    } else {
      expect.fail("expected session-scoped event");
    }
  });

  it("unsubscribe stops delivery", () => {
    const stream = createEventStream();
    const listener = vi.fn();
    const stop = stream.subscribe(listener);
    stream.publish({ type: "agent.changed", agentId: "a1" });
    stop();
    stream.publish({ type: "agent.changed", agentId: "a1" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("uses n=0 for non-session events", () => {
    const stream = createEventStream();
    const event = stream.publish({
      type: "registry.updated",
      status: { reachable: false },
    });
    expect(event.n).toBe(0);
  });
});
