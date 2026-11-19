import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findNearestFactoryDefinition,
  parseFactoryYaml,
  renderFactoryTemplate,
  validateFactoryDefinition,
} from "../../src/factory/definition.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("factory definition validation", () => {
  it("accepts a minimal valid document", () => {
    const result = validateFactoryDefinition({ version: 1 });
    expect(result.ok).toBe(true);
  });

  it("rejects wrong version and unknown keys", () => {
    const result = validateFactoryDefinition({ version: 2, foo: true });
    expect(result.ok).toBe(false);
  });

  it("requires defaultAgent to match agents", () => {
    const result = validateFactoryDefinition({
      version: 1,
      agents: [{ id: "mock-agent" }],
      defaultAgent: "missing",
    });
    expect(result.ok).toBe(false);
  });

  it("parses YAML with comments", () => {
    const result = parseFactoryYaml(`
# team setup
version: 1
agents:
  - id: mock-agent
permissionMode: always-ask
`);
    expect(result.ok).toBe(true);
    expect(result.definition?.permissionMode).toBe("always-ask");
  });
});

describe("factory lookup", () => {
  it("finds the nearest ancestor definition", () => {
    const root = mkdtempSync(join(tmpdir(), "ster-factory-"));
    dirs.push(root);
    const nested = join(root, "apps", "web");
    mkdirSync(join(root, ".ster"), { recursive: true });
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, ".ster", "factory.yaml"), "version: 1\nagents:\n  - id: mock-agent\n");
    const located = findNearestFactoryDefinition(nested);
    expect(located?.folder).toBe(realpathSync(root));
    expect(located?.definition.agents?.[0]).toEqual({ id: "mock-agent" });
  });

  it("prefers a nested definition over a parent", () => {
    const root = mkdtempSync(join(tmpdir(), "ster-factory-nest-"));
    dirs.push(root);
    const child = join(root, "service");
    mkdirSync(join(root, ".ster"), { recursive: true });
    mkdirSync(join(child, ".ster"), { recursive: true });
    writeFileSync(join(root, ".ster", "factory.yaml"), "version: 1\npermissionMode: always-ask\n");
    writeFileSync(
      join(child, ".ster", "factory.yaml"),
      "version: 1\nagents:\n  - id: mock-agent\ndefaultAgent: mock-agent\n",
    );
    const located = findNearestFactoryDefinition(child);
    expect(located?.folder).toBe(realpathSync(child));
    expect(located?.definition.defaultAgent).toBe("mock-agent");
  });
});

describe("template rendering", () => {
  it("substitutes blanks literally without evaluating expressions", () => {
    const text = renderFactoryTemplate("Hello {{name}}; code={{payload}}", {
      name: "Ada",
      payload: "{{process.exit(1)}}",
    });
    expect(text).toBe("Hello Ada; code={{process.exit(1)}}");
  });

  it("replaces missing blanks with empty string", () => {
    expect(renderFactoryTemplate("x={{missing}}", {})).toBe("x=");
  });
});
