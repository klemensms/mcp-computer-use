import type { ServiceContext } from "../types.js";
import { registerPermissionTools } from "./permission-tools.js";
import { registerWindowTools } from "./window-tools.js";
import { registerScreenshotTools } from "./screenshot-tools.js";
import { registerInputTools } from "./input-tools.js";
import { registerWaitTools } from "./wait-tools.js";

export function registerAllTools(server: any, ctx: ServiceContext): void {
  // Always available (read + screenshot)
  registerPermissionTools(server, ctx);
  registerWindowTools(server, ctx);
  registerScreenshotTools(server, ctx);

  // Write tools — gated by readonly mode
  if (!ctx.config.readonly) {
    registerInputTools(server, ctx);
    registerWaitTools(server, ctx);
  }
}
