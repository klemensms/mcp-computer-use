import { z } from "zod";
import type { ServiceContext } from "../types.js";
import {
  descWithExamples, KEY_EXAMPLES, MODIFIER_EXAMPLES, SCROLL_EXAMPLES,
} from "../tool-examples.js";

export function registerInputTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "click",
    "Click at (x, y) within the window captured by `capture_id`. Coordinates are screenshot-pixel space.",
    {
      x: z.number().describe("X coordinate, 0-indexed from left edge of captured window."),
      y: z.number().describe("Y coordinate, 0-indexed from top edge of captured window."),
      capture_id: z.string().describe("capture_id returned by the last `screenshot` call."),
    },
    async (args: { x: number; y: number; capture_id: string }) => {
      const target = await ctx.window.frontmost();
      await ctx.input.click({ x: args.x, y: args.y, captureId: args.capture_id }, {
        appName: target.appName, bundleId: target.bundleId, pid: target.pid,
        windowTitle: target.title, windowId: target.windowId,
      });
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "type_text",
    "Type text into the focused element of the frontmost window. Rejects obvious secrets.",
    {
      text: z.string().describe("Text to type. Secrets (sk-…, ghp_…, AKIA…, long base64) are rejected."),
    },
    async (args: { text: string }) => {
      const target = await ctx.window.frontmost();
      await ctx.input.typeText({ text: args.text }, {
        appName: target.appName, bundleId: target.bundleId, pid: target.pid,
        windowTitle: target.title, windowId: target.windowId,
      });
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "key_press",
    "Send a keyboard shortcut (key + optional modifiers) to the frontmost window.",
    {
      key: z.string().describe(
        descWithExamples("Key name. Common: return, escape, tab, up/down/left/right, a-z, 0-9.", KEY_EXAMPLES)
      ),
      modifiers: z.array(z.enum(["cmd", "opt", "ctrl", "shift"])).optional().describe(
        descWithExamples("Modifier keys to hold while pressing.", MODIFIER_EXAMPLES)
      ),
    },
    async (args: { key: string; modifiers?: ("cmd"|"opt"|"ctrl"|"shift")[] }) => {
      const target = await ctx.window.frontmost();
      await ctx.input.keyPress({ key: args.key, modifiers: args.modifiers }, {
        appName: target.appName, bundleId: target.bundleId, pid: target.pid,
        windowTitle: target.title, windowId: target.windowId,
      });
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "scroll",
    "Scroll the frontmost window in the given direction.",
    {
      direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction."),
      amount: z.number().int().positive().describe(
        descWithExamples("Number of scroll ticks / lines.", SCROLL_EXAMPLES)
      ),
      capture_id: z.string().optional().describe("Optional capture_id to anchor to a specific window."),
    },
    async (args: { direction: "up"|"down"|"left"|"right"; amount: number; capture_id?: string }) => {
      const target = await ctx.window.frontmost();
      await ctx.input.scroll(
        { direction: args.direction, amount: args.amount, captureId: args.capture_id },
        { appName: target.appName, bundleId: target.bundleId, pid: target.pid,
          windowTitle: target.title, windowId: target.windowId }
      );
      return { content: [{ type: "text", text: "ok" }] };
    }
  );
}
