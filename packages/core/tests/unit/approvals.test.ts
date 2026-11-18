import { describe, expect, it } from "vitest";
import { createEventStream } from "../../src/events/stream.js";
import { filterOneTimeOptions, createApprovalBroker } from "../../src/permissions/approvals.js";
import type { Store } from "../../src/store/store.js";

function fakeStore(): Store {
  let seq = 0;
  return {
    dataDir: "/tmp",
    dbPath: "/tmp/ster.db",
    migrationVersion: () => 1,
    listAppliedMigrations: () => [1],
    putSession: () => undefined,
    getSession: () => null,
    listSessions: () => [],
    deleteSession: () => undefined,
    appendItem: (item) => {
      seq += 1;
      return {
        sessionId: item.sessionId,
        seq,
        kind: item.kind,
        runId: item.runId,
        createdAt: item.createdAt,
        payloadJson: item.payloadJson,
      };
    },
    updateItemPayload: (sessionId, itemSeq, payloadJson) => ({
      sessionId,
      seq: itemSeq,
      kind: "notice",
      runId: "none",
      createdAt: new Date().toISOString(),
      payloadJson,
    }),
    listItems: () => [],
    getSetting: () => null,
    setSetting: () => undefined,
    close: () => undefined,
  };
}

describe("approval broker", () => {
  it("keeps only one-time options", () => {
    expect(
      filterOneTimeOptions([
        { optionId: "allow", name: "Allow once", kind: "allow_once" },
        { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
        { optionId: "reject", name: "Reject once", kind: "reject_once" },
        { optionId: "reject-always", name: "Reject always", kind: "reject_always" },
      ]),
    ).toEqual([
      { optionId: "allow", name: "Allow once", kind: "allow_once" },
      { optionId: "reject", name: "Reject once", kind: "reject_once" },
    ]);
  });

  it("cancels immediately when no one-time options remain", async () => {
    const broker = createApprovalBroker({
      store: fakeStore(),
      events: createEventStream(),
      currentRunId: () => "run-1",
    });
    const outcome = await broker.request({
      sessionId: "s1",
      source: "agent",
      subject: {},
      options: [{ optionId: "always", name: "Always", kind: "allow_always" }],
    });
    expect(outcome).toEqual({ by: "cancelled" });
  });

  it("resolves a pending approval and cancels on session cancel", async () => {
    const events = createEventStream();
    const broker = createApprovalBroker({
      store: fakeStore(),
      events,
      currentRunId: () => "run-1",
    });

    const pending = broker.request({
      sessionId: "s1",
      source: "agent",
      subject: { tool: "edit" },
      options: [
        { optionId: "allow", name: "Allow once", kind: "allow_once" },
        { optionId: "reject", name: "Reject once", kind: "reject_once" },
      ],
    });

    const listed = broker.pendingFor("s1");
    expect(listed).toHaveLength(1);
    const first = listed[0];
    expect(first).toBeDefined();
    if (!first) {
      throw new Error("expected pending approval");
    }
    broker.resolve(first.id, { optionId: "allow" });
    await expect(pending).resolves.toEqual({ by: "user", optionId: "allow" });

    const cancelled = broker.request({
      sessionId: "s1",
      source: "client-guard",
      subject: { reason: "stale-write" },
      options: [
        { optionId: "allow", name: "Overwrite", kind: "allow_once" },
        { optionId: "reject", name: "Cancel", kind: "reject_once" },
      ],
    });
    broker.cancelSession("s1");
    await expect(cancelled).resolves.toEqual({ by: "cancelled" });
  });
});
