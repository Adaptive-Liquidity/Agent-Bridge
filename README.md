# Agent-Bridge

A narrow, auditable control plane for scoped agent work across ChatGPT, Cursor, GitHub, and Notion.

Agent-Bridge is intentionally policy-first: it prepares and routes bounded work, preserves evidence, and stops before irreversible actions.

## Current capability

Phase 3 exposes three MCP tools:

- `bridge_status`: reports the active safety boundary without an external call.
- `github_repository_snapshot`: reads only public metadata for the single allowlisted repository, `Adaptive-Liquidity/Agent-Bridge`.
- `validate_evidence_handoff`: validates the same Evidence Handoff fields used by the Grok Bots and returns either an incomplete report or a structured packet for Docs.

The GitHub read path uses the public GitHub API without credentials. Evidence Handoff validation performs no I/O: it cannot create a Record row, contact a Grok Bot, send a message, create a PR, or control a browser/computer.

See `docs/architecture.md` and `docs/threat-model.md` for the current design.
