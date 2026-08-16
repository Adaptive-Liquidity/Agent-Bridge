# Agent-Bridge architecture

## Purpose

Agent-Bridge is a private MCP application that will let authorized ChatGPT conversations request bounded work across a small allowlist of repositories and systems.

It is not a general-purpose automation platform, browser controller, or credential store.

## Phase 1: safe foundation

The current implementation exposes one read-only MCP tool: `bridge_status`.

It also introduces the typed policy layer and provider contracts that later integrations must use:

1. The MCP tool receives a narrow request.
2. `BridgePolicy` classifies it as `allow`, `approval_required`, or `deny`.
3. Only an allowed request may reach a provider adapter.
4. A provider returns structured evidence, never free-form authority.
5. An Evidence Handoff packet records the outcome in Notion only when complete.

No provider is wired in Phase 1. No credentials are read, written, or accepted.

## Planned provider order

1. GitHub: read repository state and create draft pull requests in an explicit allowlist.
2. Cursor: start a scoped Cloud Agent run with a named repository, task, and acceptance criteria.
3. Notion: file only complete Evidence Handoff packets into Record.
4. ChatGPT custom MCP deployment: authenticated Streamable HTTP endpoint with per-tool action control.

## Permanent approval boundary

Human approval is required before merge, production deployment, data deletion, permission changes, secret handling, connector authentication, purchase, publishing, or legal acceptance.

## Source of truth

Notion Record is the handoff ledger. GitHub is the source of repository and PR state. Agent-Bridge keeps operational configuration only.
