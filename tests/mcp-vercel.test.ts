import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import handler from "../api/mcp.js";

const PUBLIC_TOKEN = "a".repeat(32);

test("forwards Vercel's parsed body to the MCP transport", async (t) => {
  const previousToken = process.env.AGENT_BRIDGE_PUBLIC_TOKEN;
  process.env.AGENT_BRIDGE_PUBLIC_TOKEN = PUBLIC_TOKEN;
  t.after(() => {
    if (previousToken === undefined) {
      delete process.env.AGENT_BRIDGE_PUBLIC_TOKEN;
    } else {
      process.env.AGENT_BRIDGE_PUBLIC_TOKEN = previousToken;
    }
  });

  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const parsedBody = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const request = {
    headers: { authorization: `Bearer ${PUBLIC_TOKEN}` },
    body: parsedBody,
  } as IncomingMessage & { body?: unknown };
  const response = {
    headersSent: false,
    writeHead() {
      return this;
    },
    end() {
      return this;
    },
  } as unknown as ServerResponse;

  await handler(request, response);

  assert.equal(handleRequest.mock.calls.length, 1);
  assert.deepEqual(handleRequest.mock.calls[0]?.arguments, [
    request,
    response,
    parsedBody,
  ]);
});
