import type {
  EvidenceHandoff,
  GitHubRepositorySnapshot,
} from "./types.js";

export interface CursorProvider {
  startScopedRun(input: {
    repository: string;
    task: string;
    acceptanceCriteria: string[];
  }): Promise<{ runId: string; status: "queued" | "running" }>;
}

export interface GitHubReadProvider {
  getRepositorySnapshot(
    repository: string,
  ): Promise<GitHubRepositorySnapshot>;
}

export interface GitHubWriteProvider {
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

interface GitHubRepositoryResponse {
  html_url?: unknown;
  private?: unknown;
  default_branch?: unknown;
  updated_at?: unknown;
  pushed_at?: unknown;
}

/**
 * Reads public repository metadata only. It sends no credential, accepts no
 * credential, and exposes no write operation.
 */
export class PublicGitHubReadProvider implements GitHubReadProvider {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async getRepositorySnapshot(
    repository: string,
  ): Promise<GitHubRepositorySnapshot> {
    const response = await this.fetchFn(
      `${this.apiBaseUrl.replace(/\\/$/, "")}/repos/${repository}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub repository read failed (${response.status}).`);
    }

    const payload = (await response.json()) as GitHubRepositoryResponse;

    return {
      repository,
      htmlUrl: requiredString(payload.html_url, "html_url"),
      visibility: requiredBoolean(payload.private, "private") ? "private" : "public",
      defaultBranch: requiredString(payload.default_branch, "default_branch"),
      updatedAt: nullableString(payload.updated_at, "updated_at"),
      pushedAt: nullableString(payload.pushed_at, "pushed_at"),
    };
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`GitHub response missing ${field}.`);
  }

  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`GitHub response missing ${field}.`);
  }

  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return requiredString(value, field);
}
