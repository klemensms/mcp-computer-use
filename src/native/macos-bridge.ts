import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { HelperTransportError, HelperCommandError } from "../errors.js";
import type { NativeBridge } from "./bridge-interface.js";
import type {
  ScreenshotRequest, ScreenshotResult,
  ClickRequest, TypeTextRequest, KeyPressRequest, ScrollRequest,
  WindowInfo, PermissionStatus,
} from "../models/index.js";
import type { Config } from "../config.js";

const COMMAND_TIMEOUT_MS = 15_000;
const SCREENSHOT_TIMEOUT_MS = 25_000;

const DEFAULT_HELPER_PATH = path.join(os.homedir(), ".mcp-computer-use", "bridge");

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface CaptureState {
  windowId: number;
  pid: number;
  bundleId?: string;
  appName: string;
  windowTitle: string;
  captureWidth: number;
  captureHeight: number;
}

interface AppInfo {
  appName: string;
  pid: number;
  bundleId?: string;
}

export interface MacosBridgeOptions {
  helperPath?: string;
  helperArgs?: string[];
  env?: NodeJS.ProcessEnv;
}

export class MacosBridge implements NativeBridge {
  private helper?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = "";
  private pending = new Map<string, Pending>();
  private helperPath: string;
  private helperArgs: string[];
  private extraEnv: NodeJS.ProcessEnv;
  private requestSeq = 0;
  private captures = new Map<string, CaptureState>();
  private appsCache: AppInfo[] | undefined;
  private appsCacheAt = 0;
  private static readonly APPS_CACHE_TTL_MS = 5_000;

  constructor(private config: Config, options: MacosBridgeOptions = {}) {
    this.helperPath = options.helperPath ?? DEFAULT_HELPER_PATH;
    this.helperArgs = options.helperArgs ?? [];
    this.extraEnv = options.env ?? {};
  }

  // -- low-level IPC ---------------------------------------------------------

  private ensureHelper(): ChildProcessWithoutNullStreams {
    if (this.helper && this.helper.exitCode === null && !this.helper.killed) {
      return this.helper;
    }
    const child = spawn(this.helperPath, this.helperArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.extraEnv },
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdin.setDefaultEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    child.stderr.on("data", (_chunk: string) => { /* ignore diagnostics */ });
    child.on("error", (err) => {
      if (this.helper === child) this.helper = undefined;
      this.rejectAllPending(new HelperTransportError(`Helper crashed: ${err.message}`));
    });
    child.on("exit", (code, sig) => {
      if (this.helper === child) this.helper = undefined;
      const reason = sig ? `signal ${sig}` : `exit ${code ?? "unknown"}`;
      this.rejectAllPending(new HelperTransportError(`Helper exited (${reason}).`));
    });
    this.helper = child;
    return child;
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    while (true) {
      const nl = this.stdoutBuffer.indexOf("\n");
      if (nl < 0) break;
      const line = this.stdoutBuffer.slice(0, nl).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1);
      if (!line) continue;
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; }
      const id = typeof msg?.id === "string" ? msg.id : undefined;
      if (!id) continue;
      const p = this.pending.get(id);
      if (!p) continue;
      this.pending.delete(id);
      clearTimeout(p.timer);
      if (msg.ok === true) {
        p.resolve(msg.result);
      } else {
        p.reject(new HelperCommandError(
          msg?.error?.message ?? "Helper command failed.",
          msg?.error?.code
        ));
      }
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(err);
    }
  }

  private async cmd<T>(
    cmd: string,
    args: Record<string, unknown> = {},
    timeoutMs = COMMAND_TIMEOUT_MS
  ): Promise<T> {
    const helper = this.ensureHelper();
    const id = `req_${++this.requestSeq}_${randomUUID().slice(0, 8)}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HelperTransportError(`Command '${cmd}' timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const payload = JSON.stringify({ id, cmd, ...args }) + "\n";
      helper.stdin.write(payload, (err) => {
        if (!err) return;
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        clearTimeout(p.timer);
        reject(new HelperTransportError(`Failed to write '${cmd}': ${err.message}`));
      });
    });
  }

  // -- helpers ---------------------------------------------------------------

  private async listAppsCached(): Promise<AppInfo[]> {
    const now = Date.now();
    if (this.appsCache && now - this.appsCacheAt < MacosBridge.APPS_CACHE_TTL_MS) {
      return this.appsCache;
    }
    const apps = await this.cmd<any[]>("listApps");
    this.appsCache = apps.map((a: any) => ({
      appName: a.appName ?? "Unknown App",
      pid: Number(a.pid),
      bundleId: a.bundleId,
    }));
    this.appsCacheAt = now;
    return this.appsCache;
  }

  private async resolveApp(bundleId?: string, pid?: number): Promise<AppInfo | undefined> {
    if (!bundleId && pid === undefined) return undefined;
    const apps = await this.listAppsCached();
    if (pid !== undefined) return apps.find((a) => a.pid === pid);
    return apps.find((a) => a.bundleId === bundleId);
  }

  private mapWindowItem(item: any, app: { appName: string; bundleId?: string; pid: number }): WindowInfo {
    const frame = item.framePoints ?? item.frame ?? { x: 0, y: 0, w: 0, h: 0 };
    return {
      appName: app.appName,
      bundleId: app.bundleId,
      pid: app.pid,
      windowId: Number(item.windowId ?? 0),
      title: String(item.title ?? ""),
      isFrontmost: Boolean(item.isFocused ?? item.isMain ?? false),
      isMinimized: Boolean(item.isMinimized ?? false),
      isOnscreen: Boolean(item.isOnscreen ?? true),
      frame: {
        x: Number(frame.x ?? 0),
        y: Number(frame.y ?? 0),
        width: Number(frame.width ?? frame.w ?? 0),
        height: Number(frame.height ?? frame.h ?? 0),
      },
    };
  }

  // -- NativeBridge public methods ------------------------------------------

  checkPermissions(): Promise<PermissionStatus> {
    return this.cmd<PermissionStatus>("checkPermissions");
  }

  async listWindows(bundleId?: string): Promise<WindowInfo[]> {
    const raw = await this.cmd<any[]>("listWindows", bundleId ? { bundleId } : {});
    const apps = await this.listAppsCached();
    // Without per-item pid we can only map windows when the caller filtered by bundleId
    // (we know the pid set from listApps). For no-filter, we best-effort by windowRef prefix
    // and fall through to the first matching bundleId on a running app (rare path).
    const filtered = bundleId
      ? apps.filter((a) => a.bundleId === bundleId)
      : apps;
    // For each window item we pair with the first matching app (heuristic when no explicit pid).
    // This is a known limitation: without Swift stamping pid per item we can't distinguish
    // multiple instances of the same bundleId reliably. Good enough for v1 — flag this.
    const fallbackApp = filtered[0] ?? { appName: "", pid: 0, bundleId };
    return raw.map((item) => this.mapWindowItem(item, fallbackApp));
  }

  async getFrontmostWindow(): Promise<WindowInfo> {
    const front = await this.cmd<any>("getFrontmost");
    const appInfo = { appName: front.appName, bundleId: front.bundleId, pid: Number(front.pid) };
    // Enrich with full window frame/flags via listWindows(pid)
    try {
      const items = await this.cmd<any[]>("listWindows", { pid: appInfo.pid });
      const matching = front.windowId !== undefined
        ? items.find((w) => Number(w.windowId) === Number(front.windowId))
        : items[0];
      if (matching) {
        return { ...this.mapWindowItem(matching, appInfo), isFrontmost: true };
      }
    } catch { /* ignore enrichment failure, fall through */ }

    // Fallback: minimum viable WindowInfo
    return {
      appName: appInfo.appName,
      bundleId: appInfo.bundleId,
      pid: appInfo.pid,
      windowId: Number(front.windowId ?? 0),
      title: String(front.windowTitle ?? ""),
      isFrontmost: true,
      isMinimized: false,
      isOnscreen: true,
      frame: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  async screenshot(req: ScreenshotRequest): Promise<ScreenshotResult> {
    // 1. Resolve target
    let target: WindowInfo;
    if (req.app || req.windowTitle) {
      const wins = await this.listWindows(req.app);
      const titled = req.windowTitle
        ? wins.find((w) => w.title.toLowerCase().includes(req.windowTitle!.toLowerCase()))
        : undefined;
      target = titled ?? wins[0]
        ?? (() => { throw new HelperCommandError(
          `No window found for app='${req.app ?? ""}' title~='${req.windowTitle ?? ""}'`,
          "window_not_found"
        ); })();
    } else {
      target = await this.getFrontmostWindow();
    }

    if (!target.windowId) {
      throw new HelperCommandError(
        `Target has no windowId — cannot screenshot '${target.appName}'`,
        "window_id_missing"
      );
    }

    // 2. Call Swift screenshot
    const shot = await this.cmd<any>("screenshot", { windowId: target.windowId }, SCREENSHOT_TIMEOUT_MS);

    // 3. Generate captureId and store state for follow-up clicks/scrolls
    const captureId = `cap_${randomUUID().slice(0, 12)}`;
    this.captures.set(captureId, {
      windowId: target.windowId,
      pid: target.pid,
      bundleId: target.bundleId,
      appName: target.appName,
      windowTitle: target.title,
      captureWidth: Number(shot.width ?? 1),
      captureHeight: Number(shot.height ?? 1),
    });

    // Bound the captures map — drop oldest beyond 20
    if (this.captures.size > 20) {
      const firstKey = this.captures.keys().next().value;
      if (firstKey) this.captures.delete(firstKey);
    }

    // 4. Compose ScreenshotResult
    return {
      target: {
        appName: target.appName,
        bundleId: target.bundleId,
        pid: target.pid,
        windowTitle: target.title,
        windowId: target.windowId,
      },
      capture: {
        captureId,
        width: Number(shot.width ?? 0),
        height: Number(shot.height ?? 0),
        scaleFactor: Number(shot.scaleFactor ?? 1),
        timestamp: Date.now(),
      },
      pngBase64: String(shot.pngBase64 ?? ""),
    };
  }

  async click(req: ClickRequest): Promise<void> {
    const state = this.captures.get(req.captureId);
    if (!state) {
      throw new HelperCommandError(
        `Unknown or stale capture_id '${req.captureId}'. Take a new screenshot first.`,
        "stale_capture_id"
      );
    }
    await this.cmd<any>("mouseClick", {
      windowId: state.windowId,
      pid: state.pid,
      x: req.x,
      y: req.y,
      captureWidth: state.captureWidth,
      captureHeight: state.captureHeight,
    });
  }

  async typeText(req: TypeTextRequest): Promise<void> {
    await this.cmd<any>("typeText", { text: req.text });
  }

  async keyPress(req: KeyPressRequest): Promise<void> {
    await this.cmd<any>("keyPress", {
      key: req.key,
      modifiers: req.modifiers ?? [],
    });
  }

  async scroll(req: ScrollRequest): Promise<void> {
    const args: Record<string, unknown> = {
      direction: req.direction,
      amount: req.amount,
    };
    if (req.captureId) {
      const state = this.captures.get(req.captureId);
      if (state) args.pid = state.pid;
    }
    await this.cmd<any>("scroll", args);
  }

  async shutdown(): Promise<void> {
    if (!this.helper) return;
    try { await this.cmd<any>("shutdown", {}, 2000); } catch { /* ignore */ }
    this.helper?.kill("SIGTERM");
    this.helper = undefined;
    this.captures.clear();
    this.rejectAllPending(new HelperTransportError("Bridge shut down."));
  }
}
