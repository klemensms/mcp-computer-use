import fs from "node:fs";
import path from "node:path";
import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerScreenshotCommands(program: any, ctx: ServiceContext): void {
  program
    .command("screenshot")
    .description("Capture a screenshot (default: frontmost window)")
    .option("--app <bundleId>", "Target bundle ID")
    .option("--window <title>", "Window title substring")
    .option("--out <path>", "Write PNG to this path")
    .action(async (opts: { app?: string; window?: string; out?: string }) => {
      try {
        const result = await ctx.screenshot.capture({ app: opts.app, windowTitle: opts.window });
        if (opts.out) {
          const p = path.resolve(process.cwd(), opts.out);
          fs.writeFileSync(p, Buffer.from(result.pngBase64, "base64"));
        }
        outputResult({
          fileName: `screenshot-${result.capture.captureId}`,
          data: { ...result, pngBase64: `[${result.pngBase64.length} chars, base64]` },
          summary: `captured ${result.target.bundleId ?? "(unknown)"} "${result.target.windowTitle}" ${result.capture.width}x${result.capture.height} capture_id=${result.capture.captureId}${opts.out ? ` (PNG → ${opts.out})` : ""}`,
        }, program.opts());
      } catch (e) { handleCliError(e, "screenshot"); }
    });
}
