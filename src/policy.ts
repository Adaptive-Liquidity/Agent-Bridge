import type {
  ActionRequest,
  BridgeAction,
  BridgePolicyConfig,
  PolicyDecision,
} from "./types.js";

const HUMAN_APPROVAL_ACTIONS = new Set<BridgeAction>([
  "github.merge",
  "deployment.production",
  "permissions.change",
  "secrets.manage",
  "connector.authenticate",
  "data.delete",
]);

const ALWAYS_DENIED_ACTIONS = new Set<BridgeAction>([
  "computer.control",
  "browser.control",
]);

const REPOSITORY_SCOPED_ACTIONS = new Set<BridgeAction>([
  "github.read",
  "github.create_draft_pr",
  "cursor.start_scoped_run",
]);

export class BridgePolicy {
  constructor(private readonly config: BridgePolicyConfig) {}

  evaluate(request: ActionRequest): PolicyDecision {
    if (ALWAYS_DENIED_ACTIONS.has(request.action)) {
      return {
        outcome: "deny",
        reasons: ["Agent-Bridge never controls arbitrary computers or browser sessions."],
      };
    }

    if (REPOSITORY_SCOPED_ACTIONS.has(request.action)) {
      if (!request.repository) {
        return {
          outcome: "deny",
          reasons: ["A repository-scoped action requires an explicit repository."],
        };
      }

      if (!this.config.allowedRepositories.includes(request.repository)) {
        return {
          outcome: "deny",
          reasons: [`Repository ${request.repository} is not allowlisted.`],
        };
      }
    }

    if (
      request.action === "notion.file_evidenced_handoff" &&
      request.evidenceComplete !== true
    ) {
      return {
        outcome: "deny",
        reasons: ["Evidence Handoff is incomplete; no Record write is permitted."],
      };
    }

    if (HUMAN_APPROVAL_ACTIONS.has(request.action)) {
      return {
        outcome: "approval_required",
        reasons: ["This action is consequential and requires explicit human approval."],
      };
    }

    return {
      outcome: "allow",
      reasons: ["The action is inside the current Phase 1 policy boundary."],
    };
  }
}
