import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export const CANONICAL_AUTH0_AUDIENCE = "https://agent-bridge-phi.vercel.app";

export const CANONICAL_AUTH0_MCP_AUDIENCE = `${CANONICAL_AUTH0_AUDIENCE}/api/mcp`;

export const TRANSITIONAL_AUTH0_AUDIENCE =
  "https://agent-bridge-oauth-preview-adaptive-liquidity-labs.vercel.app";

export const TRANSITIONAL_AUTH0_MCP_AUDIENCE = `${TRANSITIONAL_AUTH0_AUDIENCE}/api/mcp`;

export const ACCEPTED_AUTH0_ENV_AUDIENCES = [
  CANONICAL_AUTH0_AUDIENCE,
  TRANSITIONAL_AUTH0_AUDIENCE,
] as const;

export const ACCEPTED_AUTH0_JWT_AUDIENCES = [
  CANONICAL_AUTH0_AUDIENCE,
  CANONICAL_AUTH0_MCP_AUDIENCE,
  TRANSITIONAL_AUTH0_AUDIENCE,
  TRANSITIONAL_AUTH0_MCP_AUDIENCE,
] as const;

export const REQUIRED_AUTH0_SCOPE = "agent-bridge.read";

export const MIXED_AUTH_UNAUTHENTICATED_METHODS = [
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
] as const;

export type MixedAuthUnauthenticatedMethod =
  (typeof MIXED_AUTH_UNAUTHENTICATED_METHODS)[number];

export const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource";

export interface Auth0Config {
  issuer: string;
  audience: string;
  jwksUri: string;
}

export type Auth0ConfigResolution =
  | { status: "unconfigured" }
  | { status: "invalid" }
  | { status: "ready"; config: Auth0Config };

export type Auth0BearerVerification =
  | { status: "ok" }
  | { status: "unauthorized" }
  | { status: "insufficient_scope" };

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: [string];
  scopes_supported: [typeof REQUIRED_AUTH0_SCOPE];
  bearer_methods_supported: ["header"];
}

const remoteJwksByUri = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function joinIssuerWellKnown(
  issuer: string,
  wellKnownFile: string,
): string {
  const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
  return `${base}.well-known/${wellKnownFile}`;
}

export function protectedResourceMetadataUrl(): string {
  return `${CANONICAL_AUTH0_AUDIENCE}${PROTECTED_RESOURCE_METADATA_PATH}`;
}

const RFC9728_METADATA_PARAM = ["resource", "metadata"].join("_");

export function auth0WwwAuthenticate(): string {
  return `Bearer ${RFC9728_METADATA_PARAM}="${protectedResourceMetadataUrl()}", scope="${REQUIRED_AUTH0_SCOPE}", error="invalid_token", error_description="Authentication required"`;
}

export function readJsonRpcMethod(body: unknown): string | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }

  const method = (body as { method?: unknown }).method;
  return typeof method === "string" && method.length > 0 ? method : undefined;
}

export function isAuthorizationHeaderMissing(
  authorization: string | string[] | undefined,
): boolean {
  return typeof authorization !== "string" || authorization.trim().length === 0;
}

export function isMixedAuthUnauthenticatedMethod(
  method: string | undefined,
): method is MixedAuthUnauthenticatedMethod {
  return (
    method !== undefined &&
    (MIXED_AUTH_UNAUTHENTICATED_METHODS as readonly string[]).includes(method)
  );
}

export function allowsUnauthenticatedMixedAuth(
  authorization: string | string[] | undefined,
  body: unknown,
): boolean {
  return (
    isAuthorizationHeaderMissing(authorization) &&
    isMixedAuthUnauthenticatedMethod(readJsonRpcMethod(body))
  );
}

export function auth0InsufficientScopeWwwAuthenticate(): string {
  return `Bearer error="insufficient_scope", scope="${REQUIRED_AUTH0_SCOPE}", ${RFC9728_METADATA_PARAM}="${protectedResourceMetadataUrl()}"`;
}

export function resolveAuth0Config(
  environment: NodeJS.ProcessEnv = process.env,
): Auth0ConfigResolution {
  const issuer = trimEnv(environment.AUTH0_ISSUER);
  const audience = trimEnv(environment.AUTH0_AUDIENCE);
  const jwksUri = trimEnv(environment.AUTH0_JWKS_URI);

  if (issuer === undefined && audience === undefined && jwksUri === undefined) {
    return { status: "unconfigured" };
  }

  if (issuer === undefined || !isAcceptedEnvAudience(audience)) {
    return { status: "invalid" };
  }

  return {
    status: "ready",
    config: {
      issuer,
      audience: CANONICAL_AUTH0_AUDIENCE,
      jwksUri: jwksUri ?? joinIssuerWellKnown(issuer, "jwks.json"),
    },
  };
}

export function buildProtectedResourceMetadata(
  config: Auth0Config,
): ProtectedResourceMetadata {
  return {
    resource: CANONICAL_AUTH0_AUDIENCE,
    authorization_servers: [config.issuer],
    scopes_supported: [REQUIRED_AUTH0_SCOPE],
    bearer_methods_supported: ["header"],
  };
}

export async function verifyAuth0Bearer(
  authorization: string | string[] | undefined,
  config: Auth0Config,
): Promise<Auth0BearerVerification> {
  const token = extractBearerToken(authorization);

  if (token === undefined) {
    return { status: "unauthorized" };
  }

  try {
    const { payload } = await jwtVerify(token, getRemoteJwks(config.jwksUri), {
      issuer: config.issuer,
      audience: [...ACCEPTED_AUTH0_JWT_AUDIENCES],
    });

    if (!hasExactAudience(payload.aud)) {
      return { status: "unauthorized" };
    }

    if (!hasRequiredScope(payload)) {
      return { status: "insufficient_scope" };
    }

    return { status: "ok" };
  } catch {
    return { status: "unauthorized" };
  }
}

export function resetAuth0JwksCache(): void {
  remoteJwksByUri.clear();
}

function getRemoteJwks(
  jwksUri: string,
): ReturnType<typeof createRemoteJWKSet> {
  const cached = remoteJwksByUri.get(jwksUri);

  if (cached !== undefined) {
    return cached;
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  remoteJwksByUri.set(jwksUri, jwks);
  return jwks;
}

function extractBearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return undefined;
  }

  const token = authorization.slice("Bearer ".length);
  return token.length > 0 ? token : undefined;
}

function isAcceptedEnvAudience(
  audience: string | undefined,
): audience is (typeof ACCEPTED_AUTH0_ENV_AUDIENCES)[number] {
  return (
    audience !== undefined &&
    (ACCEPTED_AUTH0_ENV_AUDIENCES as readonly string[]).includes(audience)
  );
}

function isAcceptedAudience(aud: string): boolean {
  return (ACCEPTED_AUTH0_JWT_AUDIENCES as readonly string[]).includes(aud);
}

function hasExactAudience(aud: JWTPayload["aud"]): boolean {
  if (typeof aud === "string") {
    return isAcceptedAudience(aud);
  }

  const onlyAudience = Array.isArray(aud) && aud.length === 1 ? aud[0] : undefined;
  return typeof onlyAudience === "string" && isAcceptedAudience(onlyAudience);
}

function hasRequiredScope(payload: JWTPayload): boolean {
  return readScopes(payload).includes(REQUIRED_AUTH0_SCOPE);
}

function readScopes(payload: JWTPayload): string[] {
  const raw = payload.scope;

  if (typeof raw === "string") {
    return raw.split(/\s+/).filter((scope) => scope.length > 0);
  }

  if (Array.isArray(raw)) {
    return raw.filter((scope): scope is string => typeof scope === "string");
  }

  return [];
}

function trimEnv(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
