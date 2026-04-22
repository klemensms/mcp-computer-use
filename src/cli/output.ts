import { outputResult as coreOutputResult } from "@mcp-consultant-tools/core";

export function outputResult(
  args: { fileName: string; data: unknown; summary: string },
  flags: { json?: boolean; cache?: boolean }
): void {
  coreOutputResult(
    { ...args, cacheDir: "mcp-cu-cache" },
    { json: flags.json ?? false, cache: flags.cache ?? true }
  );
}
