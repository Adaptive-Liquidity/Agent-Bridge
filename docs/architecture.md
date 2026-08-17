# Agent-Bridge architecture

## Purpose

Agent-Bridge is a private MCP application that will let authorized ChatGPT conversations request bounded work across a small allowlist of repositories and systems.

It is not a general-purpose automation platform, browser controller, or credential store.

## Phase 6: confirm-gated Grok bot tools

The current implementation exposes the original three MCP tools plus confirm-gated Grok bot tools:

- `bridge_status`: reports the active policy boundary without an external call.
- `github_repository_snapshot`: returns a narrow snapshot of public metadata for the one allowlisted repository, `Adaptive-Liquidity/Agent-Bridge`.
- `validate_evidence_handoff`: validates a proposed Grok Evidence Handoff and returns a structured packet for Docs, or an explicit missing/invalid-fields result.
- `list_grok_bots` / `get_grok_bot_status`: read the configured Noema gateway with `agent-bridge.read`.
- `send_instruction_to_grok_bot`: returns a preview until `confirm=true`, then posts `{ target, instruction, idempotency_key, source: "agent-bridge", actor }` using `agent-bridge.write`. Gateway URL and token come only from `NOEMA_GATEWAY_URL` and `NOEMA_GATEWAY_TOKEN`.

It includes two HTTP transports:

- a loopback-only local transport, for development and verification;
- a Vercel-compatible `api/mcp.ts` function that is inert until `AGENT_BRIDGE_PUBLIC_TOKEN` exists in a managed environment.

The public function never creates or defaults a secret. Without a 32+ character managed token, every request receives `503`. Auth0 preview JWT auth remains fail-closed for `tools/call`. The Grok tools fail closed when gateway env is missing and never invent a URL or token. Browser and computer control remain absent.

No Vercel project, secret, domain, or deployment is created by this phase. A live connection requires a separate approval to create a project, set a managed secret, deploy a preview, verify it, then decide whether to create a ChatGPT connection.

The GitHub provider sends no credential, accepts no credential, and calls only `GET /repos/Adaptive-Liquidity/Agent-Bridge`. Its response is narrowed to repository URL, visibility, default branch, and GitHub timestamps. It has no private-repository, PR, issue, write, browser, or computer access.

The Evidence Handoff validator has no provider and performs no I/O. It validates project/scope, craft, Record type, artifact URL, verification, next owner, summary, and source links for consequential claims. A valid packet is still only a packet: Docs remains the only role that can file it to Record.

Every provider request follows this order:

1. The MCP tool constructs a narrow request.
2. `BridgePolicy` classifies it as `allow`, `approval_required`, or `deny`.
3. Only an allowed request may reach a provider adapter.
4. A provider returns structured evidence, never free-form authority.
5. An Evidence Handoff packet records the outcome in Notion only when complete.

## Planned provider order

1. GitHub: read repository state and create draft pull requests in an explicit allowlist.
2. Cursor: start a scoped Cloud Agent run with a named repository, task, and acceptance criteria.
3. Notion: file only complete Evidence Handoff packets into Record.
4. ChatGPT custom MCP deployment: authenticated Streamable HTTP endpoint with per-tool action control.

## Permanent approval boundary

Human approval is required before merge, production deployment, data deletion, permission changes, secret handling, connector authentication, purchase, publishing, or legal acceptance.

## Source of truth

Notion Record is the handoff ledger. GitHub is the source of repository and PR state. Agent-Bridge keeps operational configuration only.
