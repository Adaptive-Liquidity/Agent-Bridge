import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import {
  CANONICAL_AUTH0_AUDIENCE,
  REQUIRED_AUTH0_SCOPE,
  resetAuth0JwksCache,
} from "../src/auth0.js";

export const TEST_ISSUER = "https://preview-test.auth0.com/";
export const TEST_JWKS_URI = `${TEST_ISSUER}.well-known/jwks.json`;
export const TEST_KEY_ID = "agent-bridge-test-key";

export interface TestKeyMaterial {
  privateKey: CryptoKey;
  publicJwk: Record<string, unknown>;
}

export async function generateTestKeyMaterial(): Promise<TestKeyMaterial> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    kid: TEST_KEY_ID,
    alg: "RS256",
    use: "sig",
  };

  return { privateKey, publicJwk };
}

export async function signAccessToken(
  privateKey: CryptoKey,
  options: {
    claims?: JWTPayload;
    audience?: string | string[];
    issuer?: string;
    expirationTime?: string | number;
    kid?: string;
  } = {},
): Promise<string> {
  return new SignJWT({
    scope: REQUIRED_AUTH0_SCOPE,
    ...options.claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: options.kid ?? TEST_KEY_ID })
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? CANONICAL_AUTH0_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expirationTime ?? "5m")
    .sign(privateKey);
}

export function mockJwksFetch(
  publicJwk: Record<string, unknown>,
  jwksUri = TEST_JWKS_URI,
): void {
  resetAuth0JwksCache();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url === jwksUri || url.startsWith(jwksUri)) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (typeof originalFetch === "function") {
      return originalFetch(input, init);
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

export function restoreFetch(originalFetch: typeof fetch): void {
  globalThis.fetch = originalFetch;
  resetAuth0JwksCache();
}
