# Agent-Bridge

A narrow, auditable control plane for scoped agent work across ChatGPT, Cursor, GitHub, and Notion.

Agent-Bridge is intentionally policy-first: it prepares and routes bounded work, preserves evidence, and stops before irreversible actions.

## Current capability

Phase 6 keeps the existing three MCP tools and adds confirm-gated Grok bot tools that call a Noema gateway only when `NOEMA_GATEWAY_URL` and `NOEMA_GATEWAY_TOKEN` are set in the managed runtime:

- `bridge_status`: reports the active safety boundary without an external call.
- `github_repository_snapshot`: reads only public metadata for the single allowlisted repository, `Adaptive-Liquidity/Agent-Bridge`.
- `validate_evidence_handoff`: validates the same Evidence Handoff fields used by the Grok Bots and returns either an incomplete report or a structured packet for Docs.
- `list_grok_bots`: reads the gateway bot list. `agent-bridge.read` is enough.
- `get_grok_bot_status`: reads one gateway instruction by id. `agent-bridge.read` is enough.
- `send_instruction_to_grok_bot`: previews an instruction unless `confirm=true`. The actual send requires `agent-bridge.write` and posts once with a deterministic idempotency key.
- `npm run start:local-http`: starts only on `127.0.0.1`, only at `/mcp`, and refuses to start without `AGENT_BRIDGE_LOCAL_TOKEN` (32+ characters).
- `api/mcp.ts`: Vercel-compatible endpoint that returns `503` until a managed `AGENT_BRIDGE_PUBLIC_TOKEN` is set; it never generates or falls back to a secret.

Preview Deploy must set `NOEMA_GATEWAY_URL` (no trailing slash) and `NOEMA_GATEWAY_TOKEN` in the managed environment. Do not put those values in the repository. `AUTH0_AUDIENCE` is unchanged.

See `docs/architecture.md` and `docs/threat-model.md` for the current design.
