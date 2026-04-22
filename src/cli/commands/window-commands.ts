import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerWindowCommands(program: any, ctx: ServiceContext): void {
  program
    .command("list-windows")
    .description("List visible windows, optionally filtered by bundle ID")
    .option("--app <bundleId>", "Filter by bundle ID")
    .action(async (opts: { app?: string }) => {
      try {
        const wins = await ctx.window.list(opts.app);
        outputResult({
          fileName: `list-windows${opts.app ? "-" + opts.app : ""}`,
          data: wins,
          summary: wins.length
            ? wins.map((w) => `${w.bundleId ?? "(unknown)"} pid=${w.pid} "${w.title}"`).join("\n")
            : "(no windows)",
        }, program.opts());
      } catch (e) { handleCliError(e, "list-windows"); }
    });

  program
    .command("get-frontmost-window")
    .description("Return the currently frontmost app + window")
    .action(async () => {
      try {
        const win = await ctx.window.frontmost();
        outputResult({
          fileName: "get-frontmost-window",
          data: win,
          summary: `${win.bundleId ?? "(unknown)"} pid=${win.pid} "${win.title}"`,
        }, program.opts());
      } catch (e) { handleCliError(e, "get-frontmost-window"); }
    });
}
