import { createHash } from "node:crypto";

export const NOEMA_GATEWAY_URL_ENV = "NOEMA_GATEWAY_URL";
export const NOEMA_GATEWAY_TOKEN_ENV = "NOEMA_GATEWAY_TOKEN";

export interface NoemaGatewayConfig {
  url: string;
  token: string;
}

export type NoemaGatewayConfigResolution =
  | { status: "unconfigured" }
  | { status: "ready"; config: NoemaGatewayConfig };

export interface GrokInstructionCreated {
  id: string;
  status: string;
  target: string;
  created_at: string;
}

export interface GrokInstructionStatus extends GrokInstructionCreated {
  instruction: string;
}

export interface NoemaGateway {
  listBots(): Promise<unknown>;
  sendInstruction(input: {
    target: string;
    instruction: string;
    actor: string;
    idempotencyKey: string;
  }): Promise<GrokInstructionCreated>;
  getInstruction(id: string): Promise<GrokInstructionStatus>;
}

export function resolveNoemaGatewayConfig(
  environment: NodeJS.ProcessEnv = process.env,
): NoemaGatewayConfigResolution {
  const url = trimTrailingSlash(trimEnv(environment[NOEMA_GATEWAY_URL_ENV]));
  const token = trimEnv(environment[NOEMA_GATEWAY_TOKEN_ENV]);

  if (url === undefined || token === undefined) {
    return { status: "unconfigured" };
  }

  return { status: "ready", config: { url, token } };
}

export function grokInstructionIdempotencyKey(
  target: string,
  instruction: string,
  actor: string,
): string {
  const digest = sha256Hex(
    JSON.stringify({
      source: "agent-bridge",
      target,
      instruction,
      actor,
    }),
  );

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variantNibble(digest[16])}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

export class HttpNoemaGateway implements NoemaGateway {
  constructor(
    private readonly config: NoemaGatewayConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async listBots(): Promise<unknown> {
    const response = await this.request("/v1/bots");
    return response.json();
  }

  async sendInstruction(input: {
    target: string;
    instruction: string;
    actor: string;
    idempotencyKey: string;
  }): Promise<GrokInstructionCreated> {
    const response = await this.request("/v1/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: input.target,
        instruction: input.instruction,
        idempotency_key: input.idempotencyKey,
        source: "agent-bridge",
        actor: input.actor,
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;

    return {
      id: requiredString(payload.id, "id"),
      status: requiredString(payload.status, "status"),
      target: requiredString(payload.target, "target"),
      created_at: requiredString(payload.created_at, "created_at"),
    };
  }

  async getInstruction(id: string): Promise<GrokInstructionStatus> {
    const response = await this.request(
      `/v1/instructions/${encodeURIComponent(id)}`,
    );
    const payload = (await response.json()) as Record<string, unknown>;

    return {
      id: requiredString(payload.id, "id"),
      status: requiredString(payload.status, "status"),
      target: requiredString(payload.target, "target"),
      created_at: requiredString(payload.created_at, "created_at"),
      instruction: requiredString(payload.instruction, "instruction"),
    };
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.config.token}`);
    headers.set("Accept", "application/json");

    const response = await this.fetchFn(`${this.config.url}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new Error(`Noema gateway request failed (${response.status}).`);
    }

    return response;
  }
}

function trimEnv(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function trimTrailingSlash(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Noema gateway response missing ${field}.`);
  }

  return value;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function variantNibble(hexDigit: string | undefined): string {
  const nibble = Number.parseInt(hexDigit ?? "0", 16);
  return ((nibble & 0x3) | 0x8).toString(16);
}
