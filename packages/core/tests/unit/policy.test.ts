import { describe, expect, it } from "vitest";
import { createPolicyService, enforcePolicyNoop } from "../../src/policy/service.js";

describe("PolicyService stub", () => {
  it("starts absent with no sources", async () => {
    const policy = createPolicyService();
    expect(policy.state).toBe("absent");
    await policy.reload();
    expect(policy.state).toBe("absent");
    expect(policy.effective().items).toEqual([]);
    expect(policy.problems()).toEqual([]);
    enforcePolicyNoop(policy);
  });

  it("becomes valid when a source returns a document", async () => {
    const policy = createPolicyService({
      sources: [
        {
          kind: "machine",
          label: "memory",
          load: () => Promise.resolve({ version: 1 }),
        },
      ],
    });
    await policy.reload();
    expect(policy.state).toBe("valid");
    expect(policy.effective().items[0]?.managed).toBe(true);
  });
});
