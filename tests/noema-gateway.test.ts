import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  grokInstructionIdempotencyKey,
  HttpNoemaGateway,
  NOEMA_GATEWAY_TOKEN_ENV,
  NOEMA_GATEWAY_URL_ENV,
  resolveNoemaGatewayConfig,
} from "../src/noema-gateway.js";

const FIXTURE_URL = "https://gateway.test.example";
const FIXTURE_TOKEN = "test-gateway-token-fixture";

test("fails closed when gateway URL or token env is missing", () => {
  assert.deepEqual(resolveNoemaGatewayConfig({}), { status: "unconfigured" });
  assert.deepEqual(
    resolveNoemaGatewayConfig({ [NOEMA_GATEWAY_URL_ENV]: FIXTURE_URL }),
    { status: "unconfigured" },
  );
  assert.deepEqual(
    resolveNoemaGatewayConfig({ [NOEMA_GATEWAY_TOKEN_ENV]: FIXTURE_TOKEN }),
    { status: "unconfigured" },
  );
});

test("resolves gateway config from env names and strips a trailing slash", () => {
  assert.deepEqual(
    resolveNoemaGatewayConfig({
      [NOEMA_GATEWAY_URL_ENV]: `${FIXTURE_URL}/`,
      [NOEMA_GATEWAY_TOKEN_ENV]: ` ${FIXTURE_TOKEN} `,
    }),
    {
      status: "ready",
      config: { url: FIXTURE_URL, token: FIXTURE_TOKEN },
    },
  );
});

test("lists bots with the gateway bearer and no invented URL", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const gateway = new HttpNoemaGateway(
    { url: FIXTURE_URL, token: FIXTURE_TOKEN },
    async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      return new Response(JSON.stringify([{ id: "bot-1", name: "NOEMA" }]), {
        status: 200,
      });
    },
  );

  assert.deepEqual(await gateway.listBots(), [{ id: "bot-1", name: "NOEMA" }]);
  assert.deepEqual(requests, [
    {
      url: `${FIXTURE_URL}/v1/bots`,
      authorization: `Bearer ${FIXTURE_TOKEN}`,
    },
  ]);
});

test("posts an instruction with source agent-bridge and a UUID-shaped idempotency key", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const gateway = new HttpNoemaGateway(
    { url: FIXTURE_URL, token: FIXTURE_TOKEN },
    async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(
        JSON.stringify({
          id: "instr-1",
          status: "queued",
          target: "noema",
          created_at: "2026-08-17T00:00:00.000Z",
        }),
        { status: 200 },
      );
    },
  );

  const created = await gateway.sendInstruction({
    target: "noema",
    instruction: "Summarize the latest handoff.",
    actor: "caelin",
    idempotencyKey: grokInstructionIdempotencyKey(
      "noema",
      "Summarize the latest handoff.",
      "caelin",
    ),
  });

  assert.deepEqual(created, {
    id: "instr-1",
    status: "queued",
    target: "noema",
    created_at: "2026-08-17T00:00:00.000Z",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, `${FIXTURE_URL}/v1/instructions`);
  const body = requests[0]?.body as {
    target: string;
    instruction: string;
    actor: string;
    source: string;
    idempotency_key: string;
  };
  assert.deepEqual(
    {
      target: body.target,
      instruction: body.instruction,
      actor: body.actor,
      source: body.source,
    },
    {
      target: "noema",
      instruction: "Summarize the latest handoff.",
      actor: "caelin",
      source: "agent-bridge",
    },
  );
  assert.match(
    body.idempotency_key,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
});

test("reads instruction status from the gateway id path", async () => {
  const requests: string[] = [];
  const gateway = new HttpNoemaGateway(
    { url: FIXTURE_URL, token: FIXTURE_TOKEN },
    async (input) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify({
          id: "instr-1",
          status: "completed",
          target: "noema",
          created_at: "2026-08-17T00:00:00.000Z",
          instruction: "Summarize the latest handoff.",
        }),
        { status: 200 },
      );
    },
  );

  assert.deepEqual(await gateway.getInstruction("instr-1"), {
    id: "instr-1",
    status: "completed",
    target: "noema",
    created_at: "2026-08-17T00:00:00.000Z",
    instruction: "Summarize the latest handoff.",
  });
  assert.deepEqual(requests, [`${FIXTURE_URL}/v1/instructions/instr-1`]);
});

test("idempotency key is deterministic for the same target, instruction, and actor", () => {
  const first = grokInstructionIdempotencyKey("noema", "do the thing", "caelin");
  const second = grokInstructionIdempotencyKey("noema", "do the thing", "caelin");
  const otherActor = grokInstructionIdempotencyKey("noema", "do the thing", "docs");

  assert.equal(first, second);
  assert.notEqual(first, otherActor);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("repository source does not commit a gateway URL or token", async () => {
  const files = [
    "src/noema-gateway.ts",
    "src/server.ts",
    "api/mcp.ts",
    "README.md",
    "docs/architecture.md",
  ];

  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(text.includes("oa5yxfjg9"), false, file);
    assert.equal(
      text.includes("adaptive-liquidity-labs.vercel.app"),
      false,
      file,
    );
    assert.equal(
      /\bNOEMA_GATEWAY_TOKEN\s*[:=]\s*['"][^'"]+['"]/.test(text),
      false,
      file,
    );
  }
});
