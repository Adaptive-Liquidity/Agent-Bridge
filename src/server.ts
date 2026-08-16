import { McpServer } from "@modelcontextprotocol/server";
import { BridgePolicy } from "./policy.js";
import {
  PublicGitHubReadProvider,
  type GitHubReadProvider,
} from "./providers.js";

const ALLOWED_REPOSITORY = "Adaptive-Liquidity/Agent-Bridge";

const policy = new BridgePolicy({
  allowedRepositories: [ALLOWED_REPOSITORY],
});

export interface ServerOptions {
  githubReadProvider?: GitHubReadProvider;
}

export function createServer(options: ServerOptions = {}): McpServer {
  const githubReadProvider =
    options.githubReadProvider ?? new PublicGitHubReadProvider();

  const server = new McpServer({
    name: "agent-bridge",
    version: "0.2.0",
  });

  server.registerTool(
    "bridge_status",
    {
      description:
        "Return the Agent-Bridge Phase 2 safety boundary. This tool performs no external action.",
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              phase: "phase-2-readonly-github",
              liveProviders: ["github.public.read"],
              allowedRepository: ALLOWED_REPOSITORY,
              policy: {
                directComputerControl: policy.evaluate({
                  action: "computer.control",
                }).outcome,
                productionDeployment: policy.evaluate({
                  action: "deployment.production",
                }).outcome,
                draftPullRequest: policy.evaluate({
                  action: "github.create_draft_pr",
                  repository: ALLOWED_REPOSITORY,
                }).outcome,
              },
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    "github_repository_snapshot",
    {
      description:
        "Read the allowlisted Agent-Bridge repository's public metadata. No credential or write capability is used.",
    },
    async () => {
      const decision = policy.evaluate({
        action: "github.read",
        repository: ALLOWED_REPOSITORY,
      });

      if (decision.outcome !== "allow") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ decision }, null, 2),
            },
          ],
          isError: true,
        };
      }

      try {
        const snapshot =
          await githubReadProvider.getRepositorySnapshot(ALLOWED_REPOSITORY);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(snapshot, null, 2),
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text: "GitHub repository metadata is unavailable. No action was taken.",
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
