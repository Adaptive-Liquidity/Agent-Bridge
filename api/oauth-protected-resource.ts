import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildProtectedResourceMetadata,
  resolveAuth0Config,
} from "../src/auth0.js";

/**
 * RFC 9728 OAuth protected-resource metadata. Fails closed when Auth0
 * preview config is absent so this endpoint never invents an issuer.
 */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await handleProtectedResourceRequest(request, response);
}

export async function handleProtectedResourceRequest(
  _request: IncomingMessage,
  response: ServerResponse,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const resolved = resolveAuth0Config(environment);

  if (resolved.status !== "ready") {
    response
      .writeHead(503)
      .end("Agent-Bridge Auth0 protected-resource metadata is not configured.");
    return;
  }

  response
    .writeHead(200, { "Content-Type": "application/json" })
    .end(JSON.stringify(buildProtectedResourceMetadata(resolved.config)));
}
