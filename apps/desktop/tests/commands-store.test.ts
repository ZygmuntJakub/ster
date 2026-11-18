import { describe, expect, it } from "vitest";
import { resolveCommandExitState } from "../src/shared/command-state.js";

describe("resolveCommandExitState", () => {
  it("keeps killed when Windows exit has a code but no signal", () => {
    expect(
      resolveCommandExitState({
        previous: "killed",
        exit: { code: 1, signal: null },
      }),
    ).toBe("killed");
  });

  it("honors explicit state from core command.exited events", () => {
    expect(
      resolveCommandExitState({
        previous: "running",
        exit: { code: 1, signal: null },
        state: "killed",
      }),
    ).toBe("killed");
  });

  it("treats natural exits without a signal as exited", () => {
    expect(
      resolveCommandExitState({
        previous: "running",
        exit: { code: 0, signal: null },
      }),
    ).toBe("exited");
  });

  it("does not let a late exited event overwrite killed", () => {
    expect(
      resolveCommandExitState({
        previous: "killed",
        exit: { code: 1, signal: null },
        state: "exited",
      }),
    ).toBe("killed");
  });
});
