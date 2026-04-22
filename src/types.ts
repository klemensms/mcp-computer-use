import type { Config } from "./config.js";
import type { NativeBridge } from "./native/bridge-interface.js";
import type {
  SafetyService, AuditService, PermissionService, WindowService,
  ScreenshotService, WaitService, InputService,
} from "./services/index.js";

export interface ServiceContext {
  readonly config: Config;
  readonly bridge: NativeBridge;
  readonly safety: SafetyService;
  readonly audit: AuditService;
  readonly permission: PermissionService;
  readonly window: WindowService;
  readonly screenshot: ScreenshotService;
  readonly wait: WaitService;
  readonly input: InputService;
}
