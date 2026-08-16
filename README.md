# Agent-Bridge

A narrow, auditable control plane for scoped agent work across ChatGPT, Cursor, GitHub, and Notion.

Agent-Bridge is intentionally policy-first: it prepares and routes bounded work, preserves evidence, and stops before irreversible actions.

## Current capability

Phase 5 exposes the existing three MCP tools, a loopback-only HTTP transport, and a serverless endpoint that is disabled by default:

- `bridge_status`: reports the active safety boundary without an external call.
- `github_repository_snapshot`: reads only public metadata for the single allowlisted repository, `Adaptive-Liquidity/Agent-Bridge`.
- `validate_evidence_handoff`: validates the same Evidence Handoff fields used by the Grok Bots and returns either an incomplete report or a structured packet for Docs.
- `npm run start:local-http`: starts only on `127.0.0.1`, only at `/mcp`, and refuses to start without `AGENT_BRIDGE_LOCAL_TOKEN` (32+ characters).
- `api/mcp.ts`: Vercel-compatible endpoint that returns `503` until a managed `AGENT_BRIDGE_PUBLIC_TOKEN` is set; it never generates or falls back to a secret.

The serverless endpoint is not deployed and cannot be used by ChatGPT or a Grok Bot yet. No secret, production project, public URL, or connector has been created.

See `docs/architecture.md` and `docs/threat-model.md` for the current design.
