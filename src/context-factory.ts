import { loadConfig } from "./config.js";
import { createNativeBridge } from "./native/factory.js";
import {
  SafetyService, AuditService, PermissionService, WindowService,
  ScreenshotService, WaitService, InputService,
} from "./services/index.js";
import type { ServiceContext } from "./types.js";

export async function createServiceContext(): Promise<ServiceContext> {
  const config = loadConfig();
  const bridge = await createNativeBridge(config);
  const safety = new SafetyService(config);
  const audit = new AuditService({ enabled: config.auditEnabled, path: config.auditPath });
  const permission = new PermissionService(bridge);
  const window = new WindowService(bridge);
  const screenshot = new ScreenshotService(bridge, safety, audit);
  const wait = new WaitService(bridge, safety);
  const input = new InputService(bridge, safety, audit);
  return { config, bridge, safety, audit, permission, window, screenshot, wait, input };
}
