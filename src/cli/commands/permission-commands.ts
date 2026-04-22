import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerPermissionCommands(program: any, ctx: ServiceContext): void {
  program
    .command("check-permissions")
    .description("Report AX + Screen Recording permission status")
    .action(async () => {
      try {
        const perm = await ctx.permission.check();
        outputResult({
          fileName: "check-permissions",
          data: perm,
          summary: `accessibility=${perm.accessibility} screenRecording=${perm.screenRecording}`,
        }, program.opts());
      } catch (e) { handleCliError(e, "check-permissions"); }
    });
}
