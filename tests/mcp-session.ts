import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
  type McpServer,
} from "@modelcontextprotocol/server";

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
}

export async function withMcpSession<T>(
  server: McpServer,
  run: (request: (method: string, params?: Record<string, unknown>) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await clientTransport.start();

  let nextId = 1;
  const pending = new Map<number, (message: JSONRPCMessage) => void>();

  clientTransport.onmessage = (message) => {
    if (
      message !== null &&
      typeof message === "object" &&
      "id" in message &&
      typeof message.id === "number"
    ) {
      pending.get(message.id)?.(message);
    }
  };

  const request = async (
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> => {
    const id = nextId;
    nextId += 1;
    const settled = new Promise<JSONRPCMessage>((resolve) => {
      pending.set(id, resolve);
    });
    await clientTransport.send({
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    });
    const message = await settled;
    pending.delete(id);

    if ("error" in message) {
      throw new Error(JSON.stringify(message.error));
    }

    return (message as JsonRpcSuccess).result;
  };

  try {
    await request("initialize", {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "agent-bridge-test", version: "0.0.0" },
    });
    await clientTransport.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    return await run(request);
  } finally {
    await clientTransport.close();
    await server.close();
  }
}

export function parseToolText(result: unknown): unknown {
  if (result === null || typeof result !== "object") {
    throw new Error("MCP tool result was not an object.");
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content) || content[0] === undefined) {
    throw new Error("MCP tool result had no content.");
  }

  const first = content[0] as { type?: unknown; text?: unknown };
  if (first.type !== "text" || typeof first.text !== "string") {
    throw new Error("MCP tool result was not text.");
  }

  return JSON.parse(first.text);
}

export function toolIsError(result: unknown): boolean {
  return (
    result !== null &&
    typeof result === "object" &&
    (result as { isError?: unknown }).isError === true
  );
}
