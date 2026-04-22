import type { NativeBridge } from "../native/bridge-interface.js";
import type { SafetyService } from "./safety-service.js";
import type { WaitRequest } from "../models/index.js";

export class WaitService {
  constructor(private bridge: NativeBridge, private safety: SafetyService) {}

  async wait(req: WaitRequest): Promise<void> {
    await this.safety.rateLimit();
    const ms = typeof req.ms === "number" && req.ms > 0 ? req.ms : 1000;
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
