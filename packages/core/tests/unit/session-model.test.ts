import { describe, expect, it } from "vitest";
import { isActiveSessionStatus, transitionSessionStatus } from "../../src/sessions/session.js";
import {
  finalizeRun,
  outcomeFromStopReason,
  startRun,
  toRunSummary,
} from "../../src/runs/lifecycle.js";

describe("session state machine", () => {
  it("allows starting → idle → working → idle and rejects illegal jumps", () => {
    expect(transitionSessionStatus("starting", "idle")).toBe("idle");
    expect(transitionSessionStatus("idle", "working")).toBe("working");
    expect(transitionSessionStatus("working", "idle")).toBe("idle");
    expect(() => transitionSessionStatus("ended", "idle")).toThrow(/Illegal session transition/);
    expect(isActiveSessionStatus("idle")).toBe(true);
    expect(isActiveSessionStatus("ended")).toBe(false);
  });
});

describe("run lifecycle", () => {
  it("starts and finalises runs with stop-reason mapping", () => {
    const run = startRun({ sessionId: "s1", request: "hello" });
    expect(run.outcome).toBeUndefined();
    const done = finalizeRun(run, { outcome: "completed", stopReason: "end_turn" });
    expect(done.outcome).toBe("completed");
    expect(done.endedAt).toBeTruthy();
    expect(toRunSummary(done).outcome).toBe("completed");
    expect(outcomeFromStopReason("cancelled")).toBe("cancelled");
    expect(outcomeFromStopReason("end_turn")).toBe("completed");
    expect(outcomeFromStopReason("error")).toBe("failed");
  });
});
