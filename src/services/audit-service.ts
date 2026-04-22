import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface AuditEvent {
  tool: string;
  target: { bundleId?: string; windowTitle?: string; pid?: number };
  params: Record<string, unknown>;
  result: "ok" | "error";
  errorCode?: string;
  durationMs?: number;
  strategy?: string;
}

export interface AuditOptions {
  enabled: boolean;
  path: string;
}

export class AuditService {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private options: AuditOptions) {}

  async log(event: AuditEvent): Promise<void> {
    if (!this.options.enabled) return;

    const safe = this.redactParams(event.tool, event.params);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      tool: event.tool,
      target: event.target,
      params: safe,
      result: event.result,
      errorCode: event.errorCode,
      durationMs: event.durationMs,
      strategy: event.strategy,
    }) + "\n";

    // Chain writes so they're serialized.
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.options.path), { recursive: true });
      await fs.appendFile(this.options.path, line, "utf8");
    }).catch((err) => {
      // Never throw from audit — log to stderr and continue.
      console.error(`[mcp-computer-use] audit write failed: ${err.message}`);
    });

    // Don't make callers await the write; audit is best-effort.
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private redactParams(tool: string, params: Record<string, unknown>): Record<string, unknown> {
    if (tool === "type_text" && typeof params.text === "string") {
      const text = params.text as string;
      const hash = createHash("sha256").update(text).digest("hex").slice(0, 8);
      return { ...params, text: `[redacted, len=${text.length}, sha256-prefix=${hash}]` };
    }
    return params;
  }
}
