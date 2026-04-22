import type {
  ScreenshotRequest,
  ScreenshotResult,
  ClickRequest,
  TypeTextRequest,
  KeyPressRequest,
  ScrollRequest,
  WindowInfo,
  PermissionStatus,
} from "../models/index.js";

export interface NativeBridge {
  screenshot(req: ScreenshotRequest): Promise<ScreenshotResult>;
  click(req: ClickRequest): Promise<void>;
  typeText(req: TypeTextRequest): Promise<void>;
  keyPress(req: KeyPressRequest): Promise<void>;
  scroll(req: ScrollRequest): Promise<void>;
  listWindows(bundleId?: string): Promise<WindowInfo[]>;
  getFrontmostWindow(): Promise<WindowInfo>;
  checkPermissions(): Promise<PermissionStatus>;
  shutdown(): Promise<void>;
}
