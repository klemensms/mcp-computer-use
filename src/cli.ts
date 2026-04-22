#!/usr/bin/env node
import { createCliProgram, loadEnvForCli } from "@mcp-consultant-tools/core";
import { createServiceContext } from "./context-factory.js";
import { registerAllCommands } from "./cli/commands/index.js";

async function main() {
  loadEnvForCli();
  const program = createCliProgram({
    name: "mcp-cu-cli",
    description: "CLI for mcp-computer-use — same tools as MCP, via terminal.",
    version: "0.1.0-beta.1",
  });

  const ctx = await createServiceContext();
  registerAllCommands(program, ctx);

  await program.parseAsync(process.argv);

  // Ensure the Swift helper doesn't hang the process on exit.
  await ctx.bridge.shutdown();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
