import { z } from "zod";
import type { ServiceContext } from "../types.js";

export function registerWindowTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "list_windows",
    "List visible windows with title, bundle ID, pid, and frame. Optionally filter by bundle ID.",
    { bundleId: z.string().optional().describe("Optional bundle ID filter, e.g. 'md.obsidian'") },
    async (args: { bundleId?: string }) => {
      const windows = await ctx.window.list(args.bundleId);
      return { content: [{ type: "text", text: JSON.stringify(windows, null, 2) }] };
    }
  );

  server.tool(
    "get_frontmost_window",
    "Return the currently frontmost app + window. Safe default before any action.",
    {},
    async () => {
      const win = await ctx.window.frontmost();
      return { content: [{ type: "text", text: JSON.stringify(win, null, 2) }] };
    }
  );
}
