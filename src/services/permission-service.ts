import type { NativeBridge } from "../native/bridge-interface.js";
import type { PermissionStatus } from "../models/index.js";

export class PermissionService {
  constructor(private bridge: NativeBridge) {}
  check(): Promise<PermissionStatus> {
    return this.bridge.checkPermissions();
  }
}
