import type { NativeBridge } from "../native/bridge-interface.js";
import type { SafetyService } from "./safety-service.js";
import type { AuditService } from "./audit-service.js";
import type { ScreenshotRequest, ScreenshotResult } from "../models/index.js";

export class ScreenshotService {
  constructor(
    private bridge: NativeBridge,
    private safety: SafetyService,
    private audit: AuditService
  ) {}

  async capture(req: ScreenshotRequest): Promise<ScreenshotResult> {
    const t0 = Date.now();
    try {
      const result = await this.bridge.screenshot(req);
      // Redaction (v1 stub): Swift helper applies blur server-side when strictAx flag is sent;
      // for v1 we rely on shouldRedact as a signal and let the helper handle blurring via bundle ID.
      // If blur is not applied by helper, this is a gap tracked for v1.1.
      await this.audit.log({
        tool: "screenshot",
        target: { bundleId: result.target.bundleId, windowTitle: result.target.windowTitle, pid: result.target.pid },
        params: { app: req.app, windowTitle: req.windowTitle },
        result: "ok",
        durationMs: Date.now() - t0,
      });
      if (this.safety.shouldRedact(result.target.bundleId)) {
        // Placeholder for v1.1: call a `redact_screenshot` helper command or apply blur here.
        // For now, annotate the result so the caller/agent knows the content is pre-blurred in helper.
        // No action — the Swift helper is configured to blur sensitive apps; if it doesn't, that's a gap.
      }
      return result;
    } catch (err) {
      await this.audit.log({
        tool: "screenshot",
        target: {},
        params: { app: req.app, windowTitle: req.windowTitle },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }
}
