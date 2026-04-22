// Types mirroring the Swift helper's JSON-over-stdio protocol.
// The helper speaks the upstream pi-computer-use protocol unchanged.

export interface WindowTarget {
  appName: string;
  bundleId?: string;
  pid: number;
  windowTitle: string;
  windowId: number;
}

export interface CaptureInfo {
  captureId: string;
  width: number;
  height: number;
  scaleFactor: number;
  timestamp: number;
}

export interface ScreenshotRequest {
  app?: string;
  windowTitle?: string;
}

export interface ScreenshotResult {
  target: WindowTarget;
  capture: CaptureInfo;
  pngBase64: string;
}

export interface ClickRequest {
  x: number;
  y: number;
  captureId: string;
}

export interface TypeTextRequest {
  text: string;
}

export type Modifier = "cmd" | "opt" | "ctrl" | "shift";

export interface KeyPressRequest {
  key: string;
  modifiers?: Modifier[];
}

export type ScrollDirection = "up" | "down" | "left" | "right";

export interface ScrollRequest {
  direction: ScrollDirection;
  amount: number;
  captureId?: string;
}

export interface WaitRequest {
  ms?: number;
}

export interface WindowInfo {
  appName: string;
  bundleId?: string;
  pid: number;
  windowId: number;
  title: string;
  isFrontmost: boolean;
  isMinimized: boolean;
  isOnscreen: boolean;
  frame: { x: number; y: number; width: number; height: number };
}

export interface PermissionStatus {
  accessibility: boolean;
  screenRecording: boolean;
}

export interface ActionContext {
  targetBundleId?: string;
  toolName: string;
}
