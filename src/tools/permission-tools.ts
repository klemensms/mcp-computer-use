import type { ServiceContext } from "../types.js";

export function registerPermissionTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "check_permissions",
    "Report macOS Accessibility + Screen Recording permission status for the helper binary.",
    {},
    async () => {
      const perm = await ctx.permission.check();
      return {
        content: [{ type: "text", text: JSON.stringify(perm, null, 2) }],
      };
    }
  );
}
