import type { ServiceContext } from "../../types.js";
import { registerPermissionCommands } from "./permission-commands.js";
import { registerWindowCommands } from "./window-commands.js";
import { registerScreenshotCommands } from "./screenshot-commands.js";
import { registerInputCommands } from "./input-commands.js";
import { registerWaitCommands } from "./wait-commands.js";

export function registerAllCommands(program: any, ctx: ServiceContext): void {
  registerPermissionCommands(program, ctx);
  registerWindowCommands(program, ctx);
  registerScreenshotCommands(program, ctx);
  registerInputCommands(program, ctx);
  registerWaitCommands(program, ctx);
}
