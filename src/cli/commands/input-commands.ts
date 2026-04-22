import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerInputCommands(program: any, ctx: ServiceContext): void {
  program
    .command("click <x> <y>")
    .description("Click at (x, y) within the window captured by --capture-id")
    .requiredOption("--capture-id <id>", "capture_id from prior screenshot")
    .action(async (xStr: string, yStr: string, opts: { captureId: string }) => {
      try {
        const target = await ctx.window.frontmost();
        await ctx.input.click(
          { x: parseInt(xStr, 10), y: parseInt(yStr, 10), captureId: opts.captureId },
          { appName: target.appName, bundleId: target.bundleId, pid: target.pid,
            windowTitle: target.title, windowId: target.windowId }
        );
        outputResult({ fileName: "click", data: { x: xStr, y: yStr, captureId: opts.captureId }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "click"); }
    });

  program
    .command("type-text <text>")
    .description("Type text into the focused element of the frontmost window")
    .action(async (text: string) => {
      try {
        const target = await ctx.window.frontmost();
        await ctx.input.typeText({ text }, {
          appName: target.appName, bundleId: target.bundleId, pid: target.pid,
          windowTitle: target.title, windowId: target.windowId,
        });
        outputResult({ fileName: "type-text", data: { len: text.length }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "type-text"); }
    });

  program
    .command("key-press <key>")
    .description("Send a keyboard shortcut to the frontmost window")
    .option("--modifiers <list>", "Comma-separated: cmd,opt,ctrl,shift")
    .action(async (key: string, opts: { modifiers?: string }) => {
      try {
        const mods = opts.modifiers
          ? (opts.modifiers.split(",").map((s) => s.trim()) as ("cmd"|"opt"|"ctrl"|"shift")[])
          : undefined;
        const target = await ctx.window.frontmost();
        await ctx.input.keyPress({ key, modifiers: mods }, {
          appName: target.appName, bundleId: target.bundleId, pid: target.pid,
          windowTitle: target.title, windowId: target.windowId,
        });
        outputResult({ fileName: "key-press", data: { key, modifiers: mods }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "key-press"); }
    });

  program
    .command("scroll <direction> <amount>")
    .description("Scroll the frontmost window")
    .option("--capture-id <id>", "Optional capture_id anchor")
    .action(async (direction: string, amountStr: string, opts: { captureId?: string }) => {
      try {
        const target = await ctx.window.frontmost();
        await ctx.input.scroll(
          { direction: direction as any, amount: parseInt(amountStr, 10), captureId: opts.captureId },
          { appName: target.appName, bundleId: target.bundleId, pid: target.pid,
            windowTitle: target.title, windowId: target.windowId }
        );
        outputResult({ fileName: "scroll", data: { direction, amount: amountStr }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "scroll"); }
    });
}
