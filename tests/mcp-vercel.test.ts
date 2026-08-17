import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { handleMcpRequest } from "../api/mcp.js";
import {
  ACCEPTED_AUTH0_JWT_AUDIENCES,
  auth0InsufficientScopeWwwAuthenticate,
  auth0WwwAuthenticate,
  CANONICAL_AUTH0_AUDIENCE,
  protectedResourceMetadataUrl,
  REQUIRED_AUTH0_SCOPE,
  TRANSITIONAL_AUTH0_AUDIENCE,
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

const auth0TransitionalEnv = {
  AUTH0_ISSUER: TEST_ISSUER,
  AUTH0_AUDIENCE: TRANSITIONAL_AUTH0_AUDIENCE,
  AUTH0_JWKS_URI: TEST_JWKS_URI,
};

const PHI_RESOURCE_METADATA_URL =
  "https://agent-bridge-phi.vercel.app/.well-known/oauth-protected-resource";

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

test("Auth0 Mixed path forwards initialize without Authorization", async (t) => {
  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const parsedBody = { jsonrpc: "2.0", id: 1, method: "initialize" };
  const request = {
    headers: {},
    body: parsedBody,
  } as IncomingMessage & { body?: unknown };
  const { response, recorded } = createResponse();

  await handleMcpRequest(request, response, auth0PreviewEnv);

  assert.equal(recorded.status, undefined);
  assert.equal(handleRequest.mock.calls.length, 1);
  assert.deepEqual(handleRequest.mock.calls[0]?.arguments, [
    request,
    response,
    parsedBody,
  ]);
});

test("Auth0 Mixed path forwards tools/list without Authorization", async (t) => {
  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const parsedBody = { jsonrpc: "2.0", id: 3, method: "tools/list" };
  const request = {
    headers: {},
    body: parsedBody,
  } as IncomingMessage & { body?: unknown };
  const { response, recorded } = createResponse();

  await handleMcpRequest(request, response, auth0PreviewEnv);

  assert.equal(recorded.status, undefined);
  assert.equal(handleRequest.mock.calls.length, 1);
  assert.deepEqual(handleRequest.mock.calls[0]?.arguments, [
    request,
    response,
    parsedBody,
  ]);
});

test("Auth0 Mixed path returns a resource_metadata 401 for tools/call without a JWT", async (t) => {
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
      headers: {},
      body: {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "bridge_status" },
      },
    } as IncomingMessage & { body?: unknown },
    response,
    auth0PreviewEnv,
  );

  assert.equal(recorded.status, 401);
  assert.equal(recorded.headers?.["WWW-Authenticate"], auth0WwwAuthenticate());
  assert.equal(protectedResourceMetadataUrl(), PHI_RESOURCE_METADATA_URL);
  assert.equal(
    recorded.headers?.["WWW-Authenticate"]?.includes(
      `${["resource", "metadata"].join("_")}="${PHI_RESOURCE_METADATA_URL}"`,
    ),
    true,
  );
  assert.equal(
    recorded.headers?.["WWW-Authenticate"]?.includes('error="invalid_token"'),
    true,
  );
  assert.equal(handleRequest.mock.calls.length, 0);
});

test("Auth0 Mixed path forwards tools/call after a valid JWT with the required scope", async (t) => {
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
  const parsedBody = {
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "bridge_status" },
  };
  const request = {
    headers: { authorization: `Bearer ${token}` },
    body: parsedBody,
  } as IncomingMessage & { body?: unknown };
  const { response, recorded } = createResponse();

  await handleMcpRequest(request, response, auth0PreviewEnv);

  assert.equal(recorded.status, undefined);
  assert.equal(handleRequest.mock.calls.length, 1);
  assert.deepEqual(handleRequest.mock.calls[0]?.arguments, [
    request,
    response,
    parsedBody,
  ]);
});

test("Auth0 Mixed path still returns 401 for tools/list with an invalid JWT", async (t) => {
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
      headers: { authorization: "Bearer not-a-jwt" },
      body: { jsonrpc: "2.0", id: 12, method: "tools/list" },
    } as IncomingMessage & { body?: unknown },
    response,
    auth0PreviewEnv,
  );

  assert.equal(recorded.status, 401);
  assert.equal(recorded.headers?.["WWW-Authenticate"], auth0WwwAuthenticate());
  assert.equal(handleRequest.mock.calls.length, 0);
});

test("Auth0 Mixed path treats a non-JSON-RPC body as protected", async (t) => {
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
    { headers: {}, body: "not-json-rpc" } as IncomingMessage & { body?: unknown },
    response,
    auth0PreviewEnv,
  );

  assert.equal(recorded.status, 401);
  assert.equal(recorded.headers?.["WWW-Authenticate"], auth0WwwAuthenticate());
  assert.equal(handleRequest.mock.calls.length, 0);
});

test("Auth0 Mixed path stays ready on the transitional oauth-preview audience", async (t) => {
  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const parsedBody = { jsonrpc: "2.0", id: 14, method: "tools/list" };
  const request = {
    headers: {},
    body: parsedBody,
  } as IncomingMessage & { body?: unknown };
  const { response, recorded } = createResponse();

  await handleMcpRequest(request, response, auth0TransitionalEnv);

  assert.equal(recorded.status, undefined);
  assert.equal(handleRequest.mock.calls.length, 1);
  assert.deepEqual(handleRequest.mock.calls[0]?.arguments, [
    request,
    response,
    parsedBody,
  ]);
});

test("Auth0 preview path accepts a JWT whose audience is any accepted origin or MCP URL", async (t) => {
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

  for (const [index, audience] of ACCEPTED_AUTH0_JWT_AUDIENCES.entries()) {
    const token = await signAccessToken(keys.privateKey, { audience });
    const { response, recorded } = createResponse();
    await handleMcpRequest(
      {
        headers: { authorization: `Bearer ${token}` },
        body: { jsonrpc: "2.0", id: 13 + index, method: "tools/call" },
      } as IncomingMessage & { body?: unknown },
      response,
      auth0PreviewEnv,
    );

    assert.equal(recorded.status, undefined, audience);
  }

  assert.equal(
    handleRequest.mock.calls.length,
    ACCEPTED_AUTH0_JWT_AUDIENCES.length,
  );
});

test("Auth0 Mixed path still requires a JWT for tools/call on the transitional audience", async (t) => {
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
      headers: {},
      body: {
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: { name: "bridge_status" },
      },
    } as IncomingMessage & { body?: unknown },
    response,
    auth0TransitionalEnv,
  );

  assert.equal(recorded.status, 401);
  assert.equal(
    recorded.headers?.["WWW-Authenticate"]?.includes(
      `${["resource", "metadata"].join("_")}="${PHI_RESOURCE_METADATA_URL}"`,
    ),
    true,
  );
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

test("Auth0 preview path returns 403 when a valid JWT is missing the required scope", async (t) => {
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

  const token = await signAccessToken(keys.privateKey, {
    claims: { scope: "" },
  });
  const { response, recorded } = createResponse();
  await handleMcpRequest(
    {
      headers: { authorization: `Bearer ${token}` },
      body: { jsonrpc: "2.0", id: 6, method: "tools/list" },
    } as IncomingMessage & { body?: unknown },
    response,
    auth0PreviewEnv,
  );

  assert.equal(recorded.status, 403);
  assert.equal(
    recorded.headers?.["WWW-Authenticate"],
    auth0InsufficientScopeWwwAuthenticate(),
  );
  assert.equal(
    recorded.headers?.["WWW-Authenticate"],
    `Bearer error="insufficient_scope", scope="${REQUIRED_AUTH0_SCOPE}", ${["resource", "metadata"].join("_")}="${PHI_RESOURCE_METADATA_URL}"`,
  );
  assert.equal(handleRequest.mock.calls.length, 0);
});

test("Auth0 preview path returns 403 when a valid JWT has only other scopes", async (t) => {
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

  const token = await signAccessToken(keys.privateKey, {
    claims: { scope: "openid profile" },
  });
  const { response, recorded } = createResponse();
  await handleMcpRequest(
    {
      headers: { authorization: `Bearer ${token}` },
      body: { jsonrpc: "2.0", id: 7, method: "tools/list" },
    } as IncomingMessage & { body?: unknown },
    response,
    auth0PreviewEnv,
  );

  assert.equal(recorded.status, 403);
  assert.equal(
    recorded.headers?.["WWW-Authenticate"],
    auth0InsufficientScopeWwwAuthenticate(),
  );
  assert.equal(handleRequest.mock.calls.length, 0);
});

test("Auth0 preview path still accepts a JWT that includes the required scope", async (t) => {
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

  const token = await signAccessToken(keys.privateKey, {
    claims: { scope: `${REQUIRED_AUTH0_SCOPE} openid` },
  });
  const { response, recorded } = createResponse();
  await handleMcpRequest(
    {
      headers: { authorization: `Bearer ${token}` },
      body: { jsonrpc: "2.0", id: 8, method: "tools/list" },
    } as IncomingMessage & { body?: unknown },
    response,
    auth0PreviewEnv,
  );

  assert.equal(recorded.status, undefined);
  assert.equal(handleRequest.mock.calls.length, 1);
});

test("Auth0 preview path keeps 401 for invalid, expired, and wrong-audience JWTs", async (t) => {
  const valid = await generateTestKeyMaterial();
  const other = await generateTestKeyMaterial();
  mockJwksFetch(valid.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const handleRequest = mock.method(
    NodeStreamableHTTPServerTransport.prototype,
    "handleRequest",
    async () => undefined,
  );
  t.after(() => {
    handleRequest.mock.restore();
  });

  const invalidToken = await signAccessToken(other.privateKey);
  const expiredToken = await signAccessToken(valid.privateKey, {
    expirationTime: 0,
  });
  const wrongAudienceToken = await signAccessToken(valid.privateKey, {
    audience: "https://wrong-audience.example",
  });
  const wrongIssuerToken = await signAccessToken(valid.privateKey, {
    issuer: "https://other-tenant.auth0.com/",
  });

  for (const token of [
    invalidToken,
    expiredToken,
    wrongAudienceToken,
    wrongIssuerToken,
  ]) {
    const { response, recorded } = createResponse();
    await handleMcpRequest(
      {
        headers: { authorization: `Bearer ${token}` },
        body: { jsonrpc: "2.0", id: 9, method: "tools/list" },
      } as IncomingMessage & { body?: unknown },
      response,
      auth0PreviewEnv,
    );

    assert.equal(recorded.status, 401);
    assert.equal(recorded.headers?.["WWW-Authenticate"], auth0WwwAuthenticate());
  }

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
