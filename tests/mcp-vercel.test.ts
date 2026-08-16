import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { handleMcpRequest } from "../api/mcp.js";
import {
  auth0WwwAuthenticate,
  CANONICAL_AUTH0_AUDIENCE,
} from "../src/auth0.js";
import {
  generateTestKeyMaterial,
  mockJwksFetch,
  restoreFetch,
  signAccessToken,
  TEST_ISSUER,
  TEST_JWKS_URI,
} from "./auth0-test-support.js";

const PUBLIC_TOKEN = "a".repeat(32);
const originalFetch = globalThis.fetch;

const publicTokenEnv = {
  AGENT_BRIDGE_PUBLIC_TOKEN: PUBLIC_TOKEN,
};

const auth0PreviewEnv = {
  AUTH0_ISSUER: TEST_ISSUER,
  AUTH0_AUDIENCE: CANONICAL_AUTH0_AUDIENCE,
  AUTH0_JWKS_URI: TEST_JWKS_URI,
};

function createResponse(): {
  response: ServerResponse;
  recorded: { status?: number; headers?: Record<string, string>; body?: string };
} {
  const recorded: { status?: number; headers?: Record<string, string>; body?: string } =
    {};
  const response = {
    headersSent: false,
    writeHead(status: number, headers?: Record<string, string>) {
      recorded.status = status;
      recorded.headers = headers;
      return this;
    },
    end(body?: string) {
      recorded.body = body;
      return this;
    },
  } as unknown as ServerResponse;

  return { response, recorded };
}

test("forwards Vercel's parsed body to the MCP transport", async (t) => {
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
  const { response } = createResponse();

  await handleMcpRequest(request, response, publicTokenEnv);

  assert.equal(handleRequest.mock.calls.length, 1);
  assert.deepEqual(handleRequest.mock.calls[0]?.arguments, [
    request,
    response,
    parsedBody,
  ]);
});

test("Auth0 preview path forwards the parsed body after a valid JWT", async (t) => {
  const keys = await generateTestKeyMaterial();
  mockJwksFetch(keys.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const token = await signAccessToken(keys.privateKey);
  const parsedBody = { jsonrpc: "2.0", id: 2, method: "tools/list" };
  const request = {
    headers: { authorization: `Bearer ${token}` },
    body: parsedBody,
  } as IncomingMessage & { body?: unknown };
  const { response } = createResponse();

  await handleMcpRequest(request, response, {
    ...auth0PreviewEnv,
    AGENT_BRIDGE_PUBLIC_TOKEN: PUBLIC_TOKEN,
  });

  assert.equal(handleRequest.mock.calls.length, 1);
  assert.deepEqual(handleRequest.mock.calls[0]?.arguments, [
    request,
    response,
    parsedBody,
  ]);
});

test("Auth0 preview path returns a resource_metadata 401 for a missing JWT", async (t) => {
  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const { response, recorded } = createResponse();
  await handleMcpRequest(
    { headers: {}, body: { jsonrpc: "2.0", id: 3, method: "tools/list" } } as IncomingMessage & {
      body?: unknown;
    },
    response,
    auth0PreviewEnv,
  );

  assert.equal(recorded.status, 401);
  assert.equal(recorded.headers?.["WWW-Authenticate"], auth0WwwAuthenticate());
  assert.equal(handleRequest.mock.calls.length, 0);
});

test("Auth0 preview path does not accept AGENT_BRIDGE_PUBLIC_TOKEN as a substitute", async (t) => {
  const keys = await generateTestKeyMaterial();
  mockJwksFetch(keys.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const { response, recorded } = createResponse();
  await handleMcpRequest(
    {
      headers: { authorization: `Bearer ${PUBLIC_TOKEN}` },
      body: { jsonrpc: "2.0", id: 4, method: "tools/list" },
    } as IncomingMessage & { body?: unknown },
    response,
    {
      ...auth0PreviewEnv,
      AGENT_BRIDGE_PUBLIC_TOKEN: PUBLIC_TOKEN,
    },
  );

  assert.equal(recorded.status, 401);
  assert.equal(recorded.headers?.["WWW-Authenticate"], auth0WwwAuthenticate());
  assert.equal(
    recorded.headers?.["WWW-Authenticate"]?.includes(
      `${["resource", "metadata"].join("_")}=`,
    ),
    true,
  );
  assert.equal(handleRequest.mock.calls.length, 0);
});

test("misconfigured Auth0 audience fails closed and does not use the public token", async (t) => {
  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const { response, recorded } = createResponse();
  await handleMcpRequest(
    {
      headers: { authorization: `Bearer ${PUBLIC_TOKEN}` },
      body: { jsonrpc: "2.0", id: 5, method: "tools/list" },
    } as IncomingMessage & { body?: unknown },
    response,
    {
      AGENT_BRIDGE_PUBLIC_TOKEN: PUBLIC_TOKEN,
      AUTH0_ISSUER: TEST_ISSUER,
      AUTH0_AUDIENCE: "https://example.com",
    },
  );

  assert.equal(recorded.status, 503);
  assert.equal(handleRequest.mock.calls.length, 0);
});
