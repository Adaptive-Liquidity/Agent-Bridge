# Agent-Bridge

A narrow, auditable control plane for scoped agent work across ChatGPT, Cursor, GitHub, and Notion.

Agent-Bridge is intentionally policy-first: it prepares and routes bounded work, preserves evidence, and stops before irreversible actions.

## Current capability

Phase 2 exposes two MCP tools:

- `bridge_status`: reports the active safety boundary without an external call.
- `github_repository_snapshot`: reads only public metadata for the single allowlisted repository, `Adaptive-Liquidity/Agent-Bridge`.

The GitHub read path uses the public GitHub API without credentials. It cannot read private repositories, create pull requests, update repositories, control a browser/computer, or interact with Grok Bots.

See `docs/architecture.md` and `docs/threat-model.md` for the current design.
