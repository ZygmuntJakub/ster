import { client, methods } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { createMockAgent } from "../src/agent.js";

describe("mock agent", () => {
  it("handshakes and answers scenario: hello", async () => {
    const agentApp = createMockAgent();
    const clientApp = client({ name: "test-client" }).onRequest(
      methods.client.session.requestPermission,
      () => ({
        outcome: { outcome: "selected" as const, optionId: "allow" },
      }),
    );

    await clientApp.connectWith(agentApp, async (ctx) => {
      const init = await ctx.request(methods.agent.initialize, {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
        clientInfo: { name: "test", version: "0" },
      });
      expect(init.protocolVersion).toBe(1);
      expect(init.agentInfo?.name).toBe("ster-mock-agent");

      const session = await ctx.buildSession("/tmp/ster-mock").start();
      const response = await session.prompt("scenario: hello");
      expect(response.stopReason).toBe("end_turn");
      session.dispose();
    });
  });

  it("requires auth when configured", async () => {
    const agentApp = createMockAgent({ requireAuth: true });
    const clientApp = client({ name: "test-client" });

    await clientApp.connectWith(agentApp, async (ctx) => {
      await ctx.request(methods.agent.initialize, {
        protocolVersion: 1,
        clientCapabilities: { auth: { terminal: true } },
        clientInfo: { name: "test", version: "0" },
      });
      await expect(ctx.buildSession("/tmp/ster-mock").start()).rejects.toMatchObject({
        code: -32000,
      });
      await ctx.request(methods.agent.authenticate, { methodId: "mock-agent-login" });
      const session = await ctx.buildSession("/tmp/ster-mock").start();
      expect(session.sessionId).toBeTruthy();
      session.dispose();
    });
  });
});
