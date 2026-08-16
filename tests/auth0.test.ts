import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auth0InsufficientScopeWwwAuthenticate,
  auth0WwwAuthenticate,
  buildProtectedResourceMetadata,
  CANONICAL_AUTH0_AUDIENCE,
  joinIssuerWellKnown,
  protectedResourceMetadataUrl,
  REQUIRED_AUTH0_SCOPE,
  resolveAuth0Config,
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

test("fails closed when issuer is missing or audience is not canonical", () => {
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
    }),
    { status: "invalid" },
  );
});

test("resolves ready config and default JWKS URI from the issuer", () => {
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
      resource: CANONICAL_AUTH0_AUDIENCE,
      authorization_servers: [TEST_ISSUER],
      scopes_supported: [REQUIRED_AUTH0_SCOPE],
      bearer_methods_supported: ["header"],
    },
  );
});

test("401 challenge points at the absolute protected-resource metadata URL", () => {
  const metadataParam = ["resource", "metadata"].join("_");
  assert.equal(
    auth0WwwAuthenticate(),
    `Bearer ${metadataParam}="${protectedResourceMetadataUrl()}", scope="${REQUIRED_AUTH0_SCOPE}"`,
  );
  assert.equal(
    protectedResourceMetadataUrl(),
    `${CANONICAL_AUTH0_AUDIENCE}/.well-known/oauth-protected-resource`,
  );
});

test("403 challenge reports insufficient_scope with the same metadata URL", () => {
  const metadataParam = ["resource", "metadata"].join("_");
  assert.equal(
    auth0InsufficientScopeWwwAuthenticate(),
    `Bearer error="insufficient_scope", scope="${REQUIRED_AUTH0_SCOPE}", ${metadataParam}="${protectedResourceMetadataUrl()}"`,
  );
});
