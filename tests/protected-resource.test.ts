import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleProtectedResourceRequest } from "../api/oauth-protected-resource.js";
import {
  CANONICAL_AUTH0_AUDIENCE,
  REQUIRED_AUTH0_SCOPE,
} from "../src/auth0.js";
import { TEST_ISSUER, TEST_JWKS_URI } from "./auth0-test-support.js";

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

test("protected-resource metadata fails closed without Auth0 config", async () => {
  const { response, recorded } = createResponse();
  await handleProtectedResourceRequest({} as IncomingMessage, response, {});

  assert.equal(recorded.status, 503);
  assert.match(recorded.body ?? "", /not configured/);
});

test("protected-resource metadata fails closed on a non-canonical audience", async () => {
  const { response, recorded } = createResponse();
  await handleProtectedResourceRequest({} as IncomingMessage, response, {
    AUTH0_ISSUER: TEST_ISSUER,
    AUTH0_AUDIENCE: "https://example.com",
  });

  assert.equal(recorded.status, 503);
});

test("protected-resource metadata matches the RFC 9728 preview shape", async () => {
  const { response, recorded } = createResponse();
  await handleProtectedResourceRequest({} as IncomingMessage, response, {
    AUTH0_ISSUER: TEST_ISSUER,
    AUTH0_AUDIENCE: CANONICAL_AUTH0_AUDIENCE,
    AUTH0_JWKS_URI: TEST_JWKS_URI,
  });

  assert.equal(recorded.status, 200);
  assert.equal(recorded.headers?.["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(recorded.body ?? ""), {
    resource: CANONICAL_AUTH0_AUDIENCE,
    authorization_servers: [TEST_ISSUER],
    scopes_supported: [REQUIRED_AUTH0_SCOPE],
    bearer_methods_supported: ["header"],
  });
});
