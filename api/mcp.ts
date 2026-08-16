import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { isExpectedBearerToken } from "../src/auth.js";
import {
  auth0InsufficientScopeWwwAuthenticate,
  auth0WwwAuthenticate,
  resolveAuth0Config,
  verifyAuth0Bearer,
} from "../src/auth0.js";
import { createServer as createMcpServer } from "../src/server.js";

type VercelIncomingMessage = IncomingMessage & { body?: unknown };

/**
 * Vercel serverless endpoint. Preview Auth0 JWT auth is used when Auth0 env
 * is present; otherwise the managed public token is required. No fallback or
 * generated secret exists in source.
 */
export default async function handler(
  request: VercelIncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await handleMcpRequest(request, response);
}

export async function handleMcpRequest(
  request: VercelIncomingMessage,
  response: ServerResponse,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const auth0 = resolveAuth0Config(environment);

  if (auth0.status === "invalid") {
    response
      .writeHead(503)
      .end("Agent-Bridge Auth0 preview authorization is not configured.");
    return;
  }

  if (auth0.status === "ready") {
    const verification = await verifyAuth0Bearer(
      request.headers.authorization,
      auth0.config,
    );

    if (verification.status === "insufficient_scope") {
      response
        .writeHead(403, {
          "WWW-Authenticate": auth0InsufficientScopeWwwAuthenticate(),
        })
        .end("Insufficient scope.");
      return;
    }

    if (verification.status !== "ok") {
      response
        .writeHead(401, { "WWW-Authenticate": auth0WwwAuthenticate() })
        .end("Authentication required.");
      return;
    }
  } else {
    const bearerToken = environment.AGENT_BRIDGE_PUBLIC_TOKEN;

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
