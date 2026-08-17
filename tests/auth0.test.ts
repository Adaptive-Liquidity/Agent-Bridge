import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCEPTED_AUTH0_JWT_AUDIENCES,
  allowsUnauthenticatedMixedAuth,
  auth0InsufficientScopeWwwAuthenticate,
  auth0WwwAuthenticate,
  buildProtectedResourceMetadata,
  CANONICAL_AUTH0_AUDIENCE,
  CANONICAL_AUTH0_MCP_AUDIENCE,
  joinIssuerWellKnown,
  MIXED_AUTH_UNAUTHENTICATED_METHODS,
  protectedResourceMetadataUrl,
  readJsonRpcMethod,
  REQUIRED_AUTH0_SCOPE,
  resolveAuth0Config,
  TRANSITIONAL_AUTH0_AUDIENCE,
  TRANSITIONAL_AUTH0_MCP_AUDIENCE,
  verifyAuth0Bearer,
} from "../src/auth0.js";
import {
  generateTestKeyMaterial,
  mockJwksFetch,
  restoreFetch,
  signAccessToken,
  TEST_ISSUER,
  TEST_JWKS_URI,
} from "./auth0-test-support.js";

const originalFetch = globalThis.fetch;

test("joins JWKS URLs with or without a trailing issuer slash", () => {
  assert.equal(
    joinIssuerWellKnown("https://tenant.auth0.com/", "jwks.json"),
    "https://tenant.auth0.com/.well-known/jwks.json",
  );
  assert.equal(
    joinIssuerWellKnown("https://tenant.auth0.com", "jwks.json"),
    "https://tenant.auth0.com/.well-known/jwks.json",
  );
});

test("treats absent Auth0 env as unconfigured", () => {
  assert.deepEqual(resolveAuth0Config({}), { status: "unconfigured" });
});

test("fails closed when issuer is missing or audience is not accepted", () => {
  assert.deepEqual(
    resolveAuth0Config({
      AUTH0_AUDIENCE: CANONICAL_AUTH0_AUDIENCE,
    }),
    { status: "invalid" },
  );
  assert.deepEqual(
    resolveAuth0Config({
      AUTH0_ISSUER: TEST_ISSUER,
      AUTH0_AUDIENCE: "https://example.com",
    }),
    { status: "invalid" },
  );
  assert.deepEqual(
    resolveAuth0Config({
      AUTH0_ISSUER: TEST_ISSUER,
      AUTH0_AUDIENCE: `${CANONICAL_AUTH0_AUDIENCE}/api/mcp`,
    }),
    { status: "invalid" },
  );
  assert.deepEqual(
    resolveAuth0Config({
      AUTH0_ISSUER: TEST_ISSUER,
    }),
    { status: "invalid" },
  );
});

test("resolves ready config for the public phi audience and default JWKS URI", () => {
  assert.equal(CANONICAL_AUTH0_AUDIENCE, "https://agent-bridge-phi.vercel.app");
  assert.deepEqual(
    resolveAuth0Config({
      AUTH0_ISSUER: TEST_ISSUER,
      AUTH0_AUDIENCE: CANONICAL_AUTH0_AUDIENCE,
    }),
    {
      status: "ready",
      config: {
        issuer: TEST_ISSUER,
        audience: CANONICAL_AUTH0_AUDIENCE,
        jwksUri: TEST_JWKS_URI,
      },
    },
  );
  assert.deepEqual(
    resolveAuth0Config({
      AUTH0_ISSUER: "https://tenant.auth0.com",
      AUTH0_AUDIENCE: CANONICAL_AUTH0_AUDIENCE,
      AUTH0_JWKS_URI: "https://tenant.auth0.com/custom/jwks.json",
    }),
    {
      status: "ready",
      config: {
        issuer: "https://tenant.auth0.com",
        audience: CANONICAL_AUTH0_AUDIENCE,
        jwksUri: "https://tenant.auth0.com/custom/jwks.json",
      },
    },
  );
});

test("oauth-preview AUTH0_AUDIENCE stays ready and still resolves the phi audience", () => {
  assert.deepEqual(
    resolveAuth0Config({
      AUTH0_ISSUER: TEST_ISSUER,
      AUTH0_AUDIENCE: TRANSITIONAL_AUTH0_AUDIENCE,
    }),
    {
      status: "ready",
      config: {
        issuer: TEST_ISSUER,
        audience: CANONICAL_AUTH0_AUDIENCE,
        jwksUri: TEST_JWKS_URI,
      },
    },
  );
});

test("accepts a valid Auth0 access token signed by the mocked JWKS", async (t) => {
  const keys = await generateTestKeyMaterial();
  mockJwksFetch(keys.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const token = await signAccessToken(keys.privateKey);
  const accepted = await verifyAuth0Bearer(`Bearer ${token}`, {
    issuer: TEST_ISSUER,
    audience: CANONICAL_AUTH0_AUDIENCE,
    jwksUri: TEST_JWKS_URI,
  });

  assert.deepEqual(accepted, { status: "ok" });
});

test("rejects a token with a bad signature", async (t) => {
  const valid = await generateTestKeyMaterial();
  const other = await generateTestKeyMaterial();
  mockJwksFetch(valid.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const token = await signAccessToken(other.privateKey);
  const accepted = await verifyAuth0Bearer(`Bearer ${token}`, {
    issuer: TEST_ISSUER,
    audience: CANONICAL_AUTH0_AUDIENCE,
    jwksUri: TEST_JWKS_URI,
  });

  assert.deepEqual(accepted, { status: "unauthorized" });
});

test("accepts a token whose audience is any accepted origin or MCP resource URL", async (t) => {
  const keys = await generateTestKeyMaterial();
  mockJwksFetch(keys.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const config = {
    issuer: TEST_ISSUER,
    audience: CANONICAL_AUTH0_AUDIENCE,
    jwksUri: TEST_JWKS_URI,
  };

  assert.deepEqual(ACCEPTED_AUTH0_JWT_AUDIENCES, [
    CANONICAL_AUTH0_AUDIENCE,
    CANONICAL_AUTH0_MCP_AUDIENCE,
    TRANSITIONAL_AUTH0_AUDIENCE,
    TRANSITIONAL_AUTH0_MCP_AUDIENCE,
  ]);

  for (const audience of ACCEPTED_AUTH0_JWT_AUDIENCES) {
    const token = await signAccessToken(keys.privateKey, { audience });
    assert.deepEqual(await verifyAuth0Bearer(`Bearer ${token}`, config), {
      status: "ok",
    });

    const arrayAudienceToken = await signAccessToken(keys.privateKey, {
      audience: [audience],
    });
    assert.deepEqual(
      await verifyAuth0Bearer(`Bearer ${arrayAudienceToken}`, config),
      { status: "ok" },
    );
  }
});

test("rejects a token with the wrong audience", async (t) => {
  const keys = await generateTestKeyMaterial();
  mockJwksFetch(keys.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const token = await signAccessToken(keys.privateKey, {
    audience: "https://wrong-audience.example",
  });
  const accepted = await verifyAuth0Bearer(`Bearer ${token}`, {
    issuer: TEST_ISSUER,
    audience: CANONICAL_AUTH0_AUDIENCE,
    jwksUri: TEST_JWKS_URI,
  });

  assert.deepEqual(accepted, { status: "unauthorized" });
});

test("rejects an expired token", async (t) => {
  const keys = await generateTestKeyMaterial();
  mockJwksFetch(keys.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const token = await signAccessToken(keys.privateKey, {
    expirationTime: 0,
  });
  const accepted = await verifyAuth0Bearer(`Bearer ${token}`, {
    issuer: TEST_ISSUER,
    audience: CANONICAL_AUTH0_AUDIENCE,
    jwksUri: TEST_JWKS_URI,
  });

  assert.deepEqual(accepted, { status: "unauthorized" });
});

test("treats a valid token missing the required scope as insufficient_scope", async (t) => {
  const keys = await generateTestKeyMaterial();
  mockJwksFetch(keys.publicJwk);
  t.after(() => restoreFetch(originalFetch));

  const config = {
    issuer: TEST_ISSUER,
    audience: CANONICAL_AUTH0_AUDIENCE,
    jwksUri: TEST_JWKS_URI,
  };

  const missingScope = await signAccessToken(keys.privateKey, {
    claims: { scope: "" },
  });
  const extraOnly = await signAccessToken(keys.privateKey, {
    claims: { scope: "openid profile" },
  });
  const withRequired = await signAccessToken(keys.privateKey, {
    claims: { scope: `${REQUIRED_AUTH0_SCOPE} openid` },
  });

  assert.deepEqual(await verifyAuth0Bearer(`Bearer ${missingScope}`, config), {
    status: "insufficient_scope",
  });
  assert.deepEqual(await verifyAuth0Bearer(`Bearer ${extraOnly}`, config), {
    status: "insufficient_scope",
  });
  assert.deepEqual(await verifyAuth0Bearer(`Bearer ${withRequired}`, config), {
    status: "ok",
  });
});

test("builds RFC 9728 protected-resource metadata from Auth0 config", () => {
  assert.deepEqual(
    buildProtectedResourceMetadata({
      issuer: TEST_ISSUER,
      audience: CANONICAL_AUTH0_AUDIENCE,
      jwksUri: TEST_JWKS_URI,
    }),
    {
      resource: "https://agent-bridge-phi.vercel.app",
      authorization_servers: [TEST_ISSUER],
      scopes_supported: [REQUIRED_AUTH0_SCOPE],
      bearer_methods_supported: ["header"],
    },
  );
});

test("401 challenge points at the public phi protected-resource metadata URL", () => {
  const metadataParam = ["resource", "metadata"].join("_");
  assert.equal(
    protectedResourceMetadataUrl(),
    "https://agent-bridge-phi.vercel.app/.well-known/oauth-protected-resource",
  );
  assert.equal(
    auth0WwwAuthenticate(),
    `Bearer ${metadataParam}="${protectedResourceMetadataUrl()}", scope="${REQUIRED_AUTH0_SCOPE}", error="invalid_token", error_description="Authentication required"`,
  );
});

test("reads only a JSON-RPC object with a non-empty string method", () => {
  assert.equal(readJsonRpcMethod({ jsonrpc: "2.0", method: "tools/list" }), "tools/list");
  assert.equal(readJsonRpcMethod({ method: "initialize" }), "initialize");
  assert.equal(readJsonRpcMethod(undefined), undefined);
  assert.equal(readJsonRpcMethod(null), undefined);
  assert.equal(readJsonRpcMethod("tools/list"), undefined);
  assert.equal(readJsonRpcMethod(["tools/list"]), undefined);
  assert.equal(readJsonRpcMethod({ method: 1 }), undefined);
  assert.equal(readJsonRpcMethod({ method: "" }), undefined);
  assert.equal(readJsonRpcMethod({}), undefined);
});

test("allows unauthenticated Mixed discovery methods only without Authorization", () => {
  for (const method of MIXED_AUTH_UNAUTHENTICATED_METHODS) {
    assert.equal(
      allowsUnauthenticatedMixedAuth(undefined, { jsonrpc: "2.0", method }),
      true,
    );
    assert.equal(
      allowsUnauthenticatedMixedAuth("", { jsonrpc: "2.0", method }),
      true,
    );
    assert.equal(
      allowsUnauthenticatedMixedAuth("Bearer garbage", { jsonrpc: "2.0", method }),
      false,
    );
  }

  assert.equal(
    allowsUnauthenticatedMixedAuth(undefined, {
      jsonrpc: "2.0",
      method: "tools/call",
    }),
    false,
  );
  assert.equal(allowsUnauthenticatedMixedAuth(undefined, { jsonrpc: "2.0" }), false);
  assert.equal(allowsUnauthenticatedMixedAuth(undefined, null), false);
});

test("403 challenge reports insufficient_scope with the same metadata URL", () => {
  const metadataParam = ["resource", "metadata"].join("_");
  assert.equal(
    auth0InsufficientScopeWwwAuthenticate(),
    `Bearer error="insufficient_scope", scope="${REQUIRED_AUTH0_SCOPE}", ${metadataParam}="${protectedResourceMetadataUrl()}"`,
  );
});
