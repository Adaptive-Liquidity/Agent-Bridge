import assert from "node:assert/strict";
import test from "node:test";
import { isExpectedBearerToken } from "../src/auth.js";
import { resolveLocalHttpConfig } from "../src/local-http.js";

test("requires a sufficiently long local bearer token", () => {
  assert.throws(
    () => resolveLocalHttpConfig({}),
    /AGENT_BRIDGE_LOCAL_TOKEN/,
  );
  assert.throws(
    () => resolveLocalHttpConfig({ AGENT_BRIDGE_LOCAL_TOKEN: "too-short" }),
    /at least 32 characters/,
  );
});

test("binds only to loopback with a validated port", () => {
  const config = resolveLocalHttpConfig({
    AGENT_BRIDGE_LOCAL_TOKEN: "a".repeat(32),
    AGENT_BRIDGE_LOCAL_PORT: "4300",
  });

  assert.deepEqual(config, {
    host: "127.0.0.1",
    port: 4300,
    bearerToken: "a".repeat(32),
  });
});

test("accepts only the exact bearer value", () => {
  const token = "a".repeat(32);

  assert.equal(isExpectedBearerToken(`Bearer ${token}`, token), true);
  assert.equal(isExpectedBearerToken("Bearer wrong", token), false);
  assert.equal(isExpectedBearerToken(undefined, token), false);
});
