import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CANONICAL_AUTH0_AUDIENCE,
  REQUIRED_AUTH0_SCOPE,
  REQUIRED_AUTH0_WRITE_SCOPE,
} from "../src/auth0.js";
import {
  grokInstructionIdempotencyKey,
  type NoemaGateway,
} from "../src/noema-gateway.js";
import { createServer } from "../src/server.js";
import { parseToolText, toolIsError, withMcpSession } from "./mcp-session.js";

const EXISTING_TOOLS = [
  "bridge_status",
  "github_repository_snapshot",
  "validate_evidence_handoff",
] as const;

const GROK_TOOLS = [
  "list_grok_bots",
  "send_instruction_to_grok_bot",
  "get_grok_bot_status",
] as const;

function recordingGateway(): {
  gateway: NoemaGateway;
  posts: Array<Record<string, unknown>>;
  gets: string[];
} {
  const posts: Array<Record<string, unknown>> = [];
  const gets: string[] = [];
  const created = {
    id: "instr-1",
    status: "queued",
    target: "noema",
    created_at: "2026-08-17T00:00:00.000Z",
  };

  const gateway: NoemaGateway = {
    async listBots() {
      return [{ id: "bot-1", name: "NOEMA" }];
    },
    async sendInstruction(input) {
      posts.push({
        target: input.target,
        instruction: input.instruction,
        actor: input.actor,
        source: "agent-bridge",
        idempotency_key: input.idempotencyKey,
      });
      return created;
    },
    async getInstruction(id) {
      gets.push(id);
      return {
        ...created,
        id,
        instruction: "Summarize the latest handoff.",
      };
    },
  };

  return { gateway, posts, gets };
}

test("lists the existing three tools plus the grok tools", async () => {
  const { gateway } = recordingGateway();
  const listed = await withMcpSession(createServer({ noemaGateway: gateway }), async (request) => {
    return request("tools/list");
  });

  const tools = (listed as { tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean }; _meta?: { securitySchemes?: Array<{ scopes?: string[] }> } }> }).tools;
  const names = tools.map((tool) => tool.name);

  for (const name of EXISTING_TOOLS) {
    assert.equal(names.includes(name), true, name);
  }
  for (const name of GROK_TOOLS) {
    assert.equal(names.includes(name), true, name);
  }

  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  for (const name of [...EXISTING_TOOLS, "list_grok_bots", "get_grok_bot_status"]) {
    assert.equal(byName[name]?.annotations?.readOnlyHint, true, name);
    assert.deepEqual(byName[name]?._meta?.securitySchemes?.[0]?.scopes, [
      REQUIRED_AUTH0_SCOPE,
    ]);
  }

  assert.equal(byName.send_instruction_to_grok_bot?.annotations?.readOnlyHint, false);
  assert.deepEqual(
    byName.send_instruction_to_grok_bot?._meta?.securitySchemes?.[0]?.scopes,
    [REQUIRED_AUTH0_SCOPE, REQUIRED_AUTH0_WRITE_SCOPE],
  );
});

test("send without confirm does not POST through a gateway fetch spy", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
    });
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  try {
    await withMcpSession(
      createServer({
        environment: {
          NOEMA_GATEWAY_URL: "https://gateway.test.example",
          NOEMA_GATEWAY_TOKEN: "test-gateway-token-fixture",
        },
      }),
      async (request) =>
        request("tools/call", {
          name: "send_instruction_to_grok_bot",
          arguments: {
            target: "noema",
            instruction: "Summarize the latest handoff.",
            actor: "caelin",
          },
        }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls, []);
});

test("send without confirm does not POST to the gateway", async () => {
  const { gateway, posts } = recordingGateway();
  const payload = await withMcpSession(createServer({ noemaGateway: gateway }), async (request) => {
    return parseToolText(
      await request("tools/call", {
        name: "send_instruction_to_grok_bot",
        arguments: {
          target: "noema",
          instruction: "Summarize the latest handoff.",
          actor: "caelin",
        },
      }),
    );
  });

  assert.deepEqual(posts, []);
  assert.equal((payload as { status: string }).status, "confirmation_required");
  assert.equal((payload as { target: string }).target, "noema");
  assert.equal(
    (payload as { instruction: string }).instruction,
    "Summarize the latest handoff.",
  );
});

test("list and status work with a read-only gateway fixture", async () => {
  const { gateway, posts, gets } = recordingGateway();
  await withMcpSession(createServer({ noemaGateway: gateway }), async (request) => {
    const bots = parseToolText(await request("tools/call", { name: "list_grok_bots" }));
    const status = parseToolText(
      await request("tools/call", {
        name: "get_grok_bot_status",
        arguments: { id: "instr-1" },
      }),
    );

    assert.deepEqual(bots, [{ id: "bot-1", name: "NOEMA" }]);
    assert.deepEqual(status, {
      id: "instr-1",
      status: "queued",
      target: "noema",
      created_at: "2026-08-17T00:00:00.000Z",
      instruction: "Summarize the latest handoff.",
    });
  });

  assert.deepEqual(posts, []);
  assert.deepEqual(gets, ["instr-1"]);
});

test("confirm=true posts once and a replay reuses the same idempotency key", async () => {
  const { gateway, posts } = recordingGateway();
  const arguments_ = {
    target: "noema",
    instruction: "Summarize the latest handoff.",
    actor: "caelin",
    confirm: true,
  };

  await withMcpSession(createServer({ noemaGateway: gateway }), async (request) => {
    const first = parseToolText(
      await request("tools/call", {
        name: "send_instruction_to_grok_bot",
        arguments: arguments_,
      }),
    );
    const second = parseToolText(
      await request("tools/call", {
        name: "send_instruction_to_grok_bot",
        arguments: arguments_,
      }),
    );

    assert.deepEqual(first, {
      id: "instr-1",
      status: "queued",
      target: "noema",
      created_at: "2026-08-17T00:00:00.000Z",
    });
    assert.deepEqual(second, first);
  });

  const expectedKey = grokInstructionIdempotencyKey(
    "noema",
    "Summarize the latest handoff.",
    "caelin",
  );
  assert.equal(posts.length, 2);
  assert.equal(posts[0]?.idempotency_key, expectedKey);
  assert.equal(posts[1]?.idempotency_key, expectedKey);
  assert.deepEqual(posts[0], posts[1]);
});

test("missing gateway env fails closed without inventing a URL or token", async () => {
  const result = await withMcpSession(
    createServer({ environment: {} }),
    async (request) => request("tools/call", { name: "list_grok_bots" }),
  );

  assert.equal(toolIsError(result), true);
  const payload = parseToolText(result) as { error: string };
  assert.match(payload.error, /NOEMA_GATEWAY_URL/);
  assert.match(payload.error, /NOEMA_GATEWAY_TOKEN/);
  assert.equal(payload.error.includes("oa5yxfjg9"), false);
});

test("does not change AUTH0_AUDIENCE or the well-known resource string", () => {
  assert.equal(CANONICAL_AUTH0_AUDIENCE, "https://agent-bridge-phi.vercel.app");
  assert.equal(REQUIRED_AUTH0_SCOPE, "agent-bridge.read");
  assert.equal(REQUIRED_AUTH0_WRITE_SCOPE, "agent-bridge.write");
});
