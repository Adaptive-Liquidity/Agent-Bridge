import assert from "node:assert/strict";
import test from "node:test";
import { PublicGitHubReadProvider } from "../src/providers.js";

test("reads and narrows public repository metadata without credentials", async () => {
  const requests: Array<{ url: string; accept: string | null }> = [];
  const provider = new PublicGitHubReadProvider(async (input, init) => {
    requests.push({
      url: String(input),
      accept: new Headers(init?.headers).get("Accept"),
    });

    return new Response(
      JSON.stringify({
        html_url: "https://github.com/Adaptive-Liquidity/Agent-Bridge",
        private: false,
        default_branch: "main",
        updated_at: "2026-08-16T11:44:13Z",
        pushed_at: "2026-08-16T11:44:13Z",
        ignored_field: "never exposed",
      }),
      { status: 200 },
    );
  });

  const snapshot = await provider.getRepositorySnapshot(
    "Adaptive-Liquidity/Agent-Bridge",
  );

  assert.deepEqual(snapshot, {
    repository: "Adaptive-Liquidity/Agent-Bridge",
    htmlUrl: "https://github.com/Adaptive-Liquidity/Agent-Bridge",
    visibility: "public",
    defaultBranch: "main",
    updatedAt: "2026-08-16T11:44:13Z",
    pushedAt: "2026-08-16T11:44:13Z",
  });
  assert.deepEqual(requests, [
    {
      url: "https://api.github.com/repos/Adaptive-Liquidity/Agent-Bridge",
      accept: "application/vnd.github+json",
    },
  ]);
});

test("returns a sanitized failure for an unavailable repository", async () => {
  const provider = new PublicGitHubReadProvider(async () => new Response(null, {
    status: 404,
  }));

  await assert.rejects(
    provider.getRepositorySnapshot("Adaptive-Liquidity/Agent-Bridge"),
    /GitHub repository read failed \(404\)/,
  );
});
