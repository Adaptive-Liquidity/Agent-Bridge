import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  REQUIRED_AUTH0_SCOPE,
  REQUIRED_AUTH0_WRITE_SCOPE,
} from "./auth0.js";
import { validateEvidenceHandoff } from "./handoff.js";
import {
  grokInstructionIdempotencyKey,
  HttpNoemaGateway,
  NOEMA_GATEWAY_TOKEN_ENV,
  NOEMA_GATEWAY_URL_ENV,
  resolveNoemaGatewayConfig,
  type NoemaGateway,
} from "./noema-gateway.js";
import { BridgePolicy } from "./policy.js";
import {
  PublicGitHubReadProvider,
  type GitHubReadProvider,
} from "./providers.js";

const ALLOWED_REPOSITORY = "Adaptive-Liquidity/Agent-Bridge";

const MIXED_AUTH_TOOL_METADATA = {
  annotations: { readOnlyHint: true },
  _meta: {
    securitySchemes: [{ type: "oauth2", scopes: [REQUIRED_AUTH0_SCOPE] }],
  },
} as const;

const GROK_SEND_TOOL_METADATA = {
  annotations: { readOnlyHint: false },
  _meta: {
    securitySchemes: [
      {
        type: "oauth2",
        scopes: [REQUIRED_AUTH0_SCOPE, REQUIRED_AUTH0_WRITE_SCOPE],
      },
    ],
  },
} as const;

const policy = new BridgePolicy({
  allowedRepositories: [ALLOWED_REPOSITORY],
});

export interface ServerOptions {
  githubReadProvider?: GitHubReadProvider;
  noemaGateway?: NoemaGateway;
  environment?: NodeJS.ProcessEnv;
}

export function createServer(options: ServerOptions = {}): McpServer {
  const environment = options.environment ?? process.env;
  const githubReadProvider =
    options.githubReadProvider ?? new PublicGitHubReadProvider();
  const noemaGateway = options.noemaGateway;

  const server = new McpServer({
    name: "agent-bridge",
    version: "0.6.0",
  });

  server.registerTool(
    "bridge_status",
    {
      description:
        "Return the Agent-Bridge Phase 3 safety boundary. This tool performs no external action.",
      ...MIXED_AUTH_TOOL_METADATA,
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              phase: "phase-3-evidence-handoff-validation",
              liveProviders: ["github.public.read", "noema.gateway.grok"],
              noWriteCapabilities: ["evidence_handoff.validation"],
              confirmGatedWrites: ["send_instruction_to_grok_bot"],
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
      ...MIXED_AUTH_TOOL_METADATA,
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
      ...MIXED_AUTH_TOOL_METADATA,
      inputSchema: z.object({
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
      }),
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

  server.registerTool(
    "list_grok_bots",
    {
      description:
        "List Grok bots from the configured Noema gateway. Requires agent-bridge.read.",
      ...MIXED_AUTH_TOOL_METADATA,
    },
    async () => {
      const decision = policy.evaluate({ action: "grok.list_bots" });
      if (decision.outcome !== "allow") {
        return policyDenied(decision);
      }

      return withNoemaGateway(noemaGateway, environment, async (gateway) =>
        gateway.listBots(),
      );
    },
  );

  server.registerTool(
    "send_instruction_to_grok_bot",
    {
      description:
        "Preview or send an instruction to a Grok bot. The first call returns a preview. A second call with confirm=true sends it and requires agent-bridge.write.",
      ...GROK_SEND_TOOL_METADATA,
      inputSchema: z.object({
        target: z.string(),
        instruction: z.string(),
        actor: z.string(),
        confirm: z.boolean().optional(),
      }),
    },
    async (input) => {
      if (input.confirm !== true) {
        return jsonResult({
          status: "confirmation_required",
          target: input.target,
          instruction: input.instruction,
          actor: input.actor,
          message:
            "Confirm this instruction to the Grok bot by calling again with confirm=true. No instruction was sent.",
        });
      }

      const decision = policy.evaluate({ action: "grok.send_instruction" });
      if (decision.outcome !== "allow") {
        return policyDenied(decision);
      }

      return withNoemaGateway(noemaGateway, environment, async (gateway) =>
        gateway.sendInstruction({
          target: input.target,
          instruction: input.instruction,
          actor: input.actor,
          idempotencyKey: grokInstructionIdempotencyKey(
            input.target,
            input.instruction,
            input.actor,
          ),
        }),
      );
    },
  );

  server.registerTool(
    "get_grok_bot_status",
    {
      description:
        "Read a Grok bot instruction by id from the configured Noema gateway. Requires agent-bridge.read.",
      ...MIXED_AUTH_TOOL_METADATA,
      inputSchema: z.object({
        id: z.string(),
      }),
    },
    async (input) => {
      const decision = policy.evaluate({ action: "grok.get_instruction" });
      if (decision.outcome !== "allow") {
        return policyDenied(decision);
      }

      return withNoemaGateway(noemaGateway, environment, async (gateway) =>
        gateway.getInstruction(input.id),
      );
    },
  );

  return server;
}

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

function policyDenied(decision: { outcome: string; reasons: string[] }) {
  return jsonResult({ decision }, true);
}

async function withNoemaGateway(
  injected: NoemaGateway | undefined,
  environment: NodeJS.ProcessEnv,
  run: (gateway: NoemaGateway) => Promise<unknown>,
) {
  const gateway = resolveGateway(injected, environment);

  if (gateway === undefined) {
    return jsonResult(
      {
        error: `Noema gateway is not configured. Set ${NOEMA_GATEWAY_URL_ENV} and ${NOEMA_GATEWAY_TOKEN_ENV} in the runtime environment.`,
      },
      true,
    );
  }

  try {
    return jsonResult(await run(gateway));
  } catch {
    return jsonResult(
      { error: "Noema gateway request failed. No invented URL or token was used." },
      true,
    );
  }
}

function resolveGateway(
  injected: NoemaGateway | undefined,
  environment: NodeJS.ProcessEnv,
): NoemaGateway | undefined {
  if (injected !== undefined) {
    return injected;
  }

  const resolved = resolveNoemaGatewayConfig(environment);
  if (resolved.status !== "ready") {
    return undefined;
  }

  return new HttpNoemaGateway(resolved.config);
}
