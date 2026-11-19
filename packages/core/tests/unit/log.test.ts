import { describe, expect, it } from "vitest";
import { createLogger, redactValue, type LogRecord } from "../../src/log.js";

describe("redactValue", () => {
  it("redacts sensitive object keys", () => {
    expect(
      redactValue({
        apiKey: "sk-live-123",
        token: "abc",
        nested: { password: "secret", ok: true },
      }),
    ).toEqual({
      apiKey: "[REDACTED]",
      token: "[REDACTED]",
      nested: { password: "[REDACTED]", ok: true },
    });
  });

  it("redacts bearer tokens and key=value secrets in strings", () => {
    expect(redactValue("Authorization: Bearer abc.def.ghi")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
    expect(redactValue("api_key=super-secret PATH=/usr/bin")).toBe(
      "api_key=[REDACTED] PATH=/usr/bin",
    );
  });
});

describe("createLogger", () => {
  it("redacts fields and message content before writing", () => {
    const records: LogRecord[] = [];
    const log = createLogger({
      sink: (record) => {
        records.push(record);
      },
      now: () => new Date("2026-11-18T12:00:00.000Z"),
    });

    log.info("got Bearer tokensecret", {
      authorization: "Bearer tokensecret",
      env: { NODE_ENV: "test", OPENAI_API_KEY: "sk-test" },
    });

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record?.message).toBe("got Bearer [REDACTED]");
    expect(record?.fields).toEqual({
      authorization: "[REDACTED]",
      env: { NODE_ENV: "test", OPENAI_API_KEY: "[REDACTED]" },
    });
    expect(record?.at).toBe("2026-11-18T12:00:00.000Z");
  });

  it("child loggers inherit and merge fields with redaction", () => {
    const records: LogRecord[] = [];
    const root = createLogger({
      sink: (record) => {
        records.push(record);
      },
      fields: { sessionId: "s1" },
    });
    root.child({ api_key: "nope" }).warn("hello");
    expect(records[0]?.fields).toEqual({ sessionId: "s1", api_key: "[REDACTED]" });
  });
});
