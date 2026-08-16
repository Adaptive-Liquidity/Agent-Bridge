import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { validateEvidenceHandoff } from "./handoff.js";
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
    version: "0.3.0",
  });

  server.registerTool(
    "bridge_status",
    {
      description:
        "Return the Agent-Bridge Phase 3 safety boundary. This tool performs no external action.",
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              phase: "phase-3-evidence-handoff-validation",
              liveProviders: ["github.public.read"],
              noWriteCapabilities: ["evidence_handoff.validation"],
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
                handoffFiling: policy.evaluate({
                  action: "notion.file_evidenced_handoff",
                  evidenceComplete: false,
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

  server.registerTool(
    "validate_evidence_handoff",
    {
      description:
        "Validate a Grok Evidence Handoff packet and prepare it for Docs. This tool never writes to Notion or sends work to a Bot.",
      inputSchema: {
        projectOrScope: z.string().optional(),
        ownerCraft: z.string().optional(),
        recordType: z.string().optional(),
        artifactUrl: z.string().optional(),
        verify: z.string().optional(),
        nextOwner: z.string().optional(),
        summary: z.string().optional(),
        openBlockerOrApprovalNeeded: z.string().optional(),
        consequentialClaim: z.boolean().optional(),
        sourceUrls: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      const decision = policy.evaluate({
        action: "notion.prepare_handoff",
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(validateEvidenceHandoff(input), null, 2),
          },
        ],
      };
    },
  );

  return server;
}
