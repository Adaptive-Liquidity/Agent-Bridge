import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export const CANONICAL_AUTH0_AUDIENCE =
  "https://agent-bridge-oauth-preview-adaptive-liquidity-labs.vercel.app";

export const REQUIRED_AUTH0_SCOPE = "agent-bridge.read";

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
  return `Bearer ${RFC9728_METADATA_PARAM}="${protectedResourceMetadataUrl()}", scope="${REQUIRED_AUTH0_SCOPE}"`;
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

  if (issuer === undefined || audience !== CANONICAL_AUTH0_AUDIENCE) {
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
): Promise<boolean> {
  const token = extractBearerToken(authorization);

  if (token === undefined) {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, getRemoteJwks(config.jwksUri), {
      issuer: config.issuer,
      audience: config.audience,
    });

    return hasExactAudience(payload.aud) && hasRequiredScope(payload);
  } catch {
    return false;
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

function hasExactAudience(aud: JWTPayload["aud"]): boolean {
  return (
    aud === CANONICAL_AUTH0_AUDIENCE ||
    (Array.isArray(aud) &&
      aud.length === 1 &&
      aud[0] === CANONICAL_AUTH0_AUDIENCE)
  );
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
