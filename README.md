# Agent-Bridge

A narrow, auditable control plane for scoped agent work across ChatGPT, Cursor, GitHub, and Notion.

Agent-Bridge is intentionally policy-first: it prepares and routes bounded work, preserves evidence, and stops before irreversible actions.

## Current capability

Phase 4 exposes the existing three MCP tools and an optional **loopback-only** Streamable HTTP transport:

- `bridge_status`: reports the active safety boundary without an external call.
- `github_repository_snapshot`: reads only public metadata for the single allowlisted repository, `Adaptive-Liquidity/Agent-Bridge`.
- `validate_evidence_handoff`: validates the same Evidence Handoff fields used by the Grok Bots and returns either an incomplete report or a structured packet for Docs.
- `npm run start:local-http`: starts only on `127.0.0.1`, only at `/mcp`, and refuses to start without `AGENT_BRIDGE_LOCAL_TOKEN` (32+ characters).

The local HTTP listener is a development/verification surface, not a public endpoint. It cannot be deployed as-is, contact a Grok Bot, create a Record row, send a message, create a PR, or control a browser/computer.

See `docs/architecture.md` and `docs/threat-model.md` for the current design.
