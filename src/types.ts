export type BridgeAction =
  | "bridge.status"
  | "github.read"
  | "github.create_draft_pr"
  | "cursor.start_scoped_run"
  | "notion.prepare_handoff"
  | "notion.file_evidenced_handoff"
  | "github.merge"
  | "deployment.production"
  | "permissions.change"
  | "secrets.manage"
  | "connector.authenticate"
  | "computer.control"
  | "browser.control"
  | "data.delete";

export type PolicyOutcome = "allow" | "approval_required" | "deny";

export interface ActionRequest {
  action: BridgeAction;
  repository?: string;
  evidenceComplete?: boolean;
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  reasons: string[];
}

export interface BridgePolicyConfig {
  allowedRepositories: readonly string[];
}

export interface EvidenceHandoff {
  projectOrScope: string;
  ownerCraft: "Code" | "Deploy" | "Design" | "Docs";
  recordType: "Brief" | "Decision" | "Spec" | "Design" | "Ship" | "Research" | "Inbox";
  artifactUrl: string;
  verify: string;
  nextOwner: "Code" | "Deploy" | "Design" | "Docs" | "Done";
  summary: string;
}
