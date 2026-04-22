import { z } from "zod";
import type { ServiceContext } from "../types.js";
import { descWithExamples, SCREENSHOT_APP_EXAMPLES, WINDOW_TITLE_EXAMPLES } from "../tool-examples.js";

export function registerScreenshotTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "screenshot",
    "Capture a screenshot of a target window (default: frontmost). Returns capture_id used to anchor subsequent click/scroll calls, plus base64-encoded PNG.",
    {
      app: z.string().optional().describe(
        descWithExamples(
          "Bundle ID of the app whose window to target. Omit for frontmost.",
          SCREENSHOT_APP_EXAMPLES
        )
      ),
      windowTitle: z.string().optional().describe(
        descWithExamples(
          "Window title substring to disambiguate when an app has multiple windows.",
          WINDOW_TITLE_EXAMPLES
        )
      ),
    },
    async (args: { app?: string; windowTitle?: string }) => {
      const result = await ctx.screenshot.capture(args);
      return {
        content: [
          { type: "text", text: JSON.stringify({
            capture_id: result.capture.captureId,
            target: result.target,
            size: { width: result.capture.width, height: result.capture.height, scale: result.capture.scaleFactor },
          }, null, 2) },
          { type: "image", data: result.pngBase64, mimeType: "image/png" },
        ],
      };
    }
  );
}
