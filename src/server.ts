import { McpServer } from "@modelcontextprotocol/server";
import { BridgePolicy } from "./policy.js";

const policy = new BridgePolicy({
  allowedRepositories: ["Adaptive-Liquidity/Agent-Bridge"],
});

export function createServer(): McpServer {
  const server = new McpServer({
    name: "agent-bridge",
    version: "0.1.0",
  });

  server.registerTool(
    "bridge_status",
    {
      description:
        "Return the Agent-Bridge Phase 1 safety boundary. This tool performs no external action.",
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              phase: "phase-1-safe-foundation",
              liveProviders: false,
              allowedRepository: "Adaptive-Liquidity/Agent-Bridge",
              policy: {
                directComputerControl: policy.evaluate({
                  action: "computer.control",
                }).outcome,
                productionDeployment: policy.evaluate({
                  action: "deployment.production",
                }).outcome,
                draftPullRequest: policy.evaluate({
                  action: "github.create_draft_pr",
                  repository: "Adaptive-Liquidity/Agent-Bridge",
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

  return server;
}
