import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { isExpectedBearerToken } from "../src/auth.js";
import { createServer as createMcpServer } from "../src/server.js";

type VercelIncomingMessage = IncomingMessage & { body?: unknown };

/**
 * Vercel serverless endpoint. It remains disabled until a managed token is
 * configured; no fallback or generated secret exists in source.
 */
export default async function handler(
  request: VercelIncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const bearerToken = process.env.AGENT_BRIDGE_PUBLIC_TOKEN;

  if (typeof bearerToken !== "string" || bearerToken.length < 32) {
    response
      .writeHead(503)
      .end("Agent-Bridge public transport is not configured.");
    return;
  }

  if (!isExpectedBearerToken(request.headers.authorization, bearerToken)) {
    response
      .writeHead(401, { "WWW-Authenticate": "Bearer" })
      .end("Authentication required.");
    return;
  }

  try {
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await createMcpServer().connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch {
    if (!response.headersSent) {
      response.writeHead(500).end("MCP request failed.");
    }
  }
}
