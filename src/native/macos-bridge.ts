import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { HelperTransportError, HelperCommandError } from "../errors.js";
import type { NativeBridge } from "./bridge-interface.js";
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
import type { Config } from "../config.js";

const COMMAND_TIMEOUT_MS = 15_000;
const SCREENSHOT_TIMEOUT_MS = 25_000;

const DEFAULT_HELPER_PATH = path.join(os.homedir(), ".mcp-computer-use", "bridge");

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
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

  constructor(private config: Config, options: MacosBridgeOptions = {}) {
    this.helperPath = options.helperPath ?? DEFAULT_HELPER_PATH;
    this.helperArgs = options.helperArgs ?? [];
    this.extraEnv = options.env ?? {};
  }

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

  private async command<T>(
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

  // NativeBridge implementation ---

  screenshot(req: ScreenshotRequest): Promise<ScreenshotResult> {
    return this.command<ScreenshotResult>("screenshot", { ...req, strictAx: this.config.strictAx }, SCREENSHOT_TIMEOUT_MS);
  }

  click(req: ClickRequest): Promise<void> {
    return this.command<void>("click", { ...req, strictAx: this.config.strictAx });
  }

  typeText(req: TypeTextRequest): Promise<void> {
    return this.command<void>("type_text", { ...req, strictAx: this.config.strictAx });
  }

  keyPress(req: KeyPressRequest): Promise<void> {
    return this.command<void>("key_press", { ...req, strictAx: this.config.strictAx });
  }

  scroll(req: ScrollRequest): Promise<void> {
    return this.command<void>("scroll", { ...req, strictAx: this.config.strictAx });
  }

  listWindows(bundleId?: string): Promise<WindowInfo[]> {
    return this.command<WindowInfo[]>("list_windows", bundleId ? { bundleId } : {});
  }

  getFrontmostWindow(): Promise<WindowInfo> {
    return this.command<WindowInfo>("get_frontmost_window");
  }

  checkPermissions(): Promise<PermissionStatus> {
    return this.command<PermissionStatus>("check_permissions");
  }

  async shutdown(): Promise<void> {
    if (!this.helper) return;
    try { await this.command<void>("shutdown", {}, 2000); } catch { /* ignore */ }
    this.helper?.kill("SIGTERM");
    this.helper = undefined;
    this.rejectAllPending(new HelperTransportError("Bridge shut down."));
  }
}
