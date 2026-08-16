import type { EvidenceHandoff } from "./types.js";

export interface CursorProvider {
  startScopedRun(input: {
    repository: string;
    task: string;
    acceptanceCriteria: string[];
  }): Promise<{ runId: string; status: "queued" | "running" }>;
}

export interface GitHubProvider {
  createDraftPullRequest(input: {
    repository: string;
    branch: string;
    title: string;
    body: string;
  }): Promise<{ url: string; number: number }>;
}

export interface NotionProvider {
  fileEvidenceHandoff(input: EvidenceHandoff): Promise<{ recordUrl: string }>;
}
