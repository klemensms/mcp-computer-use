import { z } from "zod";
import type { ServiceContext } from "../types.js";

export function registerWaitTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "wait",
    "Pause for `ms` milliseconds (default 1000). Counts against the rate limit.",
    { ms: z.number().int().positive().optional().describe("Milliseconds to wait (default 1000).") },
    async (args: { ms?: number }) => {
      await ctx.wait.wait({ ms: args.ms });
      return { content: [{ type: "text", text: "ok" }] };
    }
  );
}
