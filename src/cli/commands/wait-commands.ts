import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerWaitCommands(program: any, ctx: ServiceContext): void {
  program
    .command("wait")
    .description("Pause for N ms (default 1000)")
    .option("--ms <n>", "Milliseconds to wait")
    .action(async (opts: { ms?: string }) => {
      try {
        const ms = opts.ms ? parseInt(opts.ms, 10) : undefined;
        await ctx.wait.wait({ ms });
        outputResult({ fileName: "wait", data: { ms: ms ?? 1000 }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "wait"); }
    });
}
