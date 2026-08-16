# Agent-Bridge threat model

## Assets

- Source code and pull-request state
- Notion Record integrity
- Cursor execution authority
- Provider credentials
- Approval decisions and audit evidence

## Primary threats and controls

| Threat | Control |
| --- | --- |
| Prompt injection through issue, PR, or document text | Treat all provider content as untrusted data; policy is code-owned and cannot be changed by tool output. |
| Scope expansion across repositories | Every repo action requires an explicit repository and an allowlist match. |
| Silent irreversible action | Merge, production deploy, deletion, permissions, secrets, and connector authentication return `approval_required`. |
| Shared-computer/session takeover | The bridge has no computer or browser-control action; both are hard-denied. |
| Incomplete or invented handoff | Notion filing is denied unless the Evidence Handoff is explicitly complete. |
| Credential leakage | Credentials must exist only in managed runtime secret storage; never in Git, MCP inputs, logs, or provider responses. |
| Third-party MCP overreach | Each future provider is implemented as a small adapter with an allowlisted action surface and tests. |

## Non-goals

- No broad filesystem tool
- No arbitrary command execution
- No browser automation
- No long-term model memory
- No autonomous merge or production deployment
