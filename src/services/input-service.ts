import type { NativeBridge } from "../native/bridge-interface.js";
import type { SafetyService } from "./safety-service.js";
import type { AuditService } from "./audit-service.js";
import type {
  ClickRequest, TypeTextRequest, KeyPressRequest, ScrollRequest, WindowTarget,
} from "../models/index.js";

export class InputService {
  constructor(
    private bridge: NativeBridge,
    private safety: SafetyService,
    private audit: AuditService
  ) {}

  async click(req: ClickRequest, target: WindowTarget): Promise<void> {
    this.safety.assertAllowed(target.bundleId);
    await this.safety.rateLimit();
    const t0 = Date.now();
    try {
      await this.bridge.click(req);
      await this.audit.log({
        tool: "click",
        target: { bundleId: target.bundleId, windowTitle: target.windowTitle, pid: target.pid },
        params: { x: req.x, y: req.y, captureId: req.captureId },
        result: "ok",
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      await this.audit.log({
        tool: "click",
        target: { bundleId: target.bundleId },
        params: { x: req.x, y: req.y, captureId: req.captureId },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }

  async typeText(req: TypeTextRequest, target: WindowTarget): Promise<void> {
    this.safety.assertAllowed(target.bundleId);
    this.safety.scanForSecrets(req.text);
    await this.safety.rateLimit();
    const t0 = Date.now();
    try {
      await this.bridge.typeText(req);
      await this.audit.log({
        tool: "type_text",
        target: { bundleId: target.bundleId, windowTitle: target.windowTitle, pid: target.pid },
        params: { text: req.text }, // audit-service redacts
        result: "ok",
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      await this.audit.log({
        tool: "type_text",
        target: { bundleId: target.bundleId },
        params: { text: req.text },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }

  async keyPress(req: KeyPressRequest, target: WindowTarget): Promise<void> {
    this.safety.assertAllowed(target.bundleId);
    await this.safety.rateLimit();
    const t0 = Date.now();
    try {
      await this.bridge.keyPress(req);
      await this.audit.log({
        tool: "key_press",
        target: { bundleId: target.bundleId, windowTitle: target.windowTitle, pid: target.pid },
        params: { key: req.key, modifiers: req.modifiers ?? [] },
        result: "ok",
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      await this.audit.log({
        tool: "key_press",
        target: { bundleId: target.bundleId },
        params: { key: req.key, modifiers: req.modifiers ?? [] },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }

  async scroll(req: ScrollRequest, target: WindowTarget): Promise<void> {
    this.safety.assertAllowed(target.bundleId);
    await this.safety.rateLimit();
    const t0 = Date.now();
    try {
      await this.bridge.scroll(req);
      await this.audit.log({
        tool: "scroll",
        target: { bundleId: target.bundleId, windowTitle: target.windowTitle, pid: target.pid },
        params: { direction: req.direction, amount: req.amount },
        result: "ok",
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      await this.audit.log({
        tool: "scroll",
        target: { bundleId: target.bundleId },
        params: { direction: req.direction, amount: req.amount },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }
}
