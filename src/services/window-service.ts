import type { NativeBridge } from "../native/bridge-interface.js";
import type { WindowInfo } from "../models/index.js";

export class WindowService {
  constructor(private bridge: NativeBridge) {}
  list(bundleId?: string): Promise<WindowInfo[]> {
    return this.bridge.listWindows(bundleId);
  }
  frontmost(): Promise<WindowInfo> {
    return this.bridge.getFrontmostWindow();
  }
}
