import assert from "node:assert/strict";
import test from "node:test";
import { BridgePolicy } from "../src/policy.js";

const policy = new BridgePolicy({
  allowedRepositories: ["Adaptive-Liquidity/Agent-Bridge"],
});

test("allows a scoped draft PR", () => {
  const decision = policy.evaluate({
    action: "github.create_draft_pr",
    repository: "Adaptive-Liquidity/Agent-Bridge",
  });

  assert.equal(decision.outcome, "allow");
});

test("rejects work outside the allowlist", () => {
  const decision = policy.evaluate({
    action: "cursor.start_scoped_run",
    repository: "Adaptive-Liquidity/Control-Room",
  });

  assert.equal(decision.outcome, "deny");
});

test("requires approval for merge", () => {
  const decision = policy.evaluate({
    action: "github.merge",
    repository: "Adaptive-Liquidity/Agent-Bridge",
  });

  assert.equal(decision.outcome, "approval_required");
});

test("rejects incomplete Notion handoffs", () => {
  const decision = policy.evaluate({
    action: "notion.file_evidenced_handoff",
    evidenceComplete: false,
  });

  assert.equal(decision.outcome, "deny");
});

test("allows grok list, status, and confirm-gated send", () => {
  assert.equal(policy.evaluate({ action: "grok.list_bots" }).outcome, "allow");
  assert.equal(
    policy.evaluate({ action: "grok.get_instruction" }).outcome,
    "allow",
  );
  assert.equal(
    policy.evaluate({ action: "grok.send_instruction" }).outcome,
    "allow",
  );
});

test("always rejects shared computer control", () => {
  const decision = policy.evaluate({
    action: "computer.control",
  });

  assert.equal(decision.outcome, "deny");
});
