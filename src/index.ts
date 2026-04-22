#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";

import { createServiceContext } from "./context-factory.js";
import { registerAllTools } from "./tools/index.js";

export async function registerComputerUseTools(server: any): Promise<void> {
  const ctx = await createServiceContext();
  registerAllTools(server, ctx);

  // Shutdown bridge on transport close
  process.on("SIGINT", () => { ctx.bridge.shutdown().finally(() => process.exit(0)); });
  process.on("SIGTERM", () => { ctx.bridge.shutdown().finally(() => process.exit(0)); });
}

// Self-executing block — only runs when invoked directly as `mcp-cu`
const entryUrl = pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === entryUrl) {
  createEnvLoader();
  const server = createMcpServer({
    name: "mcp-computer-use",
    version: "0.1.0-beta.1",
  });
  const transport = new StdioServerTransport();
  registerComputerUseTools(server)
    .then(() => server.connect(transport))
    .catch((err) => {
      console.error("Failed to start mcp-computer-use:", err);
      process.exit(1);
    });
}
