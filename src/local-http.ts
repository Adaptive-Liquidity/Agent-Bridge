import { createServer as createNodeHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from "@modelcontextprotocol/node";
import { isExpectedBearerToken } from "./auth.js";
import { createServer as createMcpServer } from "./server.js";

const LOCAL_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

export interface LocalHttpConfig {
  host: typeof LOCAL_HOST;
  port: number;
  bearerToken: string;
}

/**
 * The HTTP transport is intentionally loopback-only. It is a local verification
 * surface, not a public ChatGPT endpoint or a deployment path.
 */
export function resolveLocalHttpConfig(
  environment: NodeJS.ProcessEnv = process.env,
): LocalHttpConfig {
  const bearerToken = environment.AGENT_BRIDGE_LOCAL_TOKEN;

  if (typeof bearerToken !== "string" || bearerToken.length < 32) {
    throw new Error(
      "AGENT_BRIDGE_LOCAL_TOKEN must be set to a secret of at least 32 characters.",
    );
  }

  const rawPort = environment.AGENT_BRIDGE_LOCAL_PORT ?? String(DEFAULT_PORT);
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("AGENT_BRIDGE_LOCAL_PORT must be an integer between 1024 and 65535.");
  }

  return { host: LOCAL_HOST, port, bearerToken };
}

export function startLocalHttpServer(
  config = resolveLocalHttpConfig(),
): ReturnType<typeof createNodeHttpServer> {
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const httpServer = createNodeHttpServer((request, response) => {
    void handleRequest(request, response, config, validateHost, validateOrigin);
  });

  httpServer.listen(config.port, config.host, () => {
    console.error(
      `Agent-Bridge local MCP server listening at http://${config.host}:${config.port}/mcp`,
    );
  });

  return httpServer;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: LocalHttpConfig,
  validateHost: (request: IncomingMessage, response: ServerResponse) => boolean,
  validateOrigin: (request: IncomingMessage, response: ServerResponse) => boolean,
): Promise<void> {
  if (request.url !== "/mcp") {
    response.writeHead(404).end();
    return;
  }

  if (!validateHost(request, response) || !validateOrigin(request, response)) {
    return;
  }

  if (!isExpectedBearerToken(request.headers.authorization, config.bearerToken)) {
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
    await transport.handleRequest(request, response);
  } catch {
    if (!response.headersSent) {
      response.writeHead(500).end("MCP request failed.");
    }
  }
}

const entryPoint = process.argv[1];

if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  try {
    startLocalHttpServer();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unable to start local MCP server.",
    );
    process.exitCode = 1;
  }
}
