import assert from "node:assert/strict";
import test from "node:test";
import { validateEvidenceHandoff } from "../src/handoff.js";

test("rejects an incomplete handoff without allowing a write", () => {
  const result = validateEvidenceHandoff({
    projectOrScope: "Nexus",
    ownerCraft: "Docs",
    recordType: "Decision",
    nextOwner: "Done",
    summary: "A decision was reviewed.",
  });

  assert.deepEqual(result, {
    status: "handoff_incomplete",
    mayWrite: false,
    missingFields: ["artifactUrl", "verify"],
    invalidFields: [],
    correctOwner: "Docs",
  });
});

test("requires source links for consequential claims", () => {
  const result = validateEvidenceHandoff({
    projectOrScope: "Control-Room",
    ownerCraft: "Code",
    recordType: "Ship",
    artifactUrl: "https://github.com/Adaptive-Liquidity/control-room/pull/3",
    verify: "Merged with checks passing.",
    nextOwner: "Done",
    summary: "Control Room foundation shipped.",
    consequentialClaim: true,
  });

  assert.deepEqual(result, {
    status: "handoff_incomplete",
    mayWrite: false,
    missingFields: ["sourceUrls"],
    invalidFields: [],
    correctOwner: "Code",
  });
});

test("prepares a valid packet but never files it", () => {
  const result = validateEvidenceHandoff({
    projectOrScope: "Control-Room",
    ownerCraft: "Code",
    recordType: "Ship",
    artifactUrl: "https://github.com/Adaptive-Liquidity/control-room/pull/3",
    verify: "Merged with checks passing.",
    nextOwner: "Done",
    summary: "Control Room foundation shipped.",
    consequentialClaim: true,
    sourceUrls: [
      "https://github.com/Adaptive-Liquidity/control-room/pull/3",
    ],
  });

  assert.deepEqual(result, {
    status: "valid_packet",
    mayWrite: false,
    handoffPacket: {
      projectOrScope: "Control-Room",
      ownerCraft: "Code",
      recordType: "Ship",
      artifactUrl: "https://github.com/Adaptive-Liquidity/control-room/pull/3",
      verify: "Merged with checks passing.",
      nextOwner: "Done",
      summary: "Control Room foundation shipped.",
      sourceUrls: [
        "https://github.com/Adaptive-Liquidity/control-room/pull/3",
      ],
    },
  });
});
