import { describe, expect, it } from "vitest";
import { z } from "zod";
import { indexById, indexPolicyItems } from "../../src/extensions/index.js";

describe("extension registries", () => {
  it("indexes agents and permission modes by id", () => {
    const map = indexById([
      { id: "a", list: () => Promise.resolve([]) },
      { id: "b", list: () => Promise.resolve([]) },
    ]);
    expect([...map.keys()]).toEqual(["a", "b"]);
  });

  it("rejects duplicate extension ids and policy keys", () => {
    expect(() => indexById([{ id: "x" }, { id: "x" }])).toThrow(/Duplicate extension id/);
    expect(() =>
      indexPolicyItems([
        { key: "x-a", schema: z.string(), enforce: () => undefined },
        { key: "x-a", schema: z.string(), enforce: () => undefined },
      ]),
    ).toThrow(/Duplicate policy item key/);
  });
});
