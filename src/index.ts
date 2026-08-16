import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

const handle = serveStdio(createServer);

console.error("Agent-Bridge Phase 1 is listening on stdio.");

process.on("SIGINT", () => {
  void handle.close();
});

process.on("SIGTERM", () => {
  void handle.close();
});
