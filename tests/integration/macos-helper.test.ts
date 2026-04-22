import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MacosBridge } from "../../src/native/macos-bridge.js";
import { loadConfig } from "../../src/config.js";

const HELPER = path.join(os.homedir(), ".mcp-computer-use", "bridge");
const isMac = process.platform === "darwin";

async function helperExists(): Promise<boolean> {
  try { await fs.access(HELPER, fsConstants.X_OK); return true; } catch { return false; }
}

describe.skipIf(!isMac)("Swift helper integration (macOS only)", () => {
  let bridge: MacosBridge;
  let permsOk = false;

  beforeAll(async () => {
    if (!(await helperExists())) {
      throw new Error(`Swift helper not installed at ${HELPER}. Run: npm run build:native`);
    }
    bridge = new MacosBridge(loadConfig());
    const perm = await bridge.checkPermissions();
    permsOk = perm.accessibility && perm.screenRecording;
    if (!permsOk) {
      console.warn(
        `[integration] AX/Screen Recording not granted — test suite will skip action checks. ` +
          `Enable ~/.mcp-computer-use/bridge in System Settings → Privacy & Security.`
      );
    }
  });

  afterAll(async () => {
    await bridge?.shutdown();
  });

  it("check_permissions returns a well-formed object", async () => {
    const perm = await bridge.checkPermissions();
    expect(perm).toHaveProperty("accessibility");
    expect(perm).toHaveProperty("screenRecording");
    expect(typeof perm.accessibility).toBe("boolean");
    expect(typeof perm.screenRecording).toBe("boolean");
  });

  it("list_windows returns an array (or is skipped if perms missing)", async () => {
    if (!permsOk) return;
    const wins = await bridge.listWindows();
    expect(Array.isArray(wins)).toBe(true);
    // Usually at least one window is onscreen during test runs. If zero, just assert the shape of what we got.
    for (const w of wins) {
      expect(w).toHaveProperty("pid");
      expect(w).toHaveProperty("title");
      expect(w).toHaveProperty("frame");
      expect(typeof w.pid).toBe("number");
    }
  });

  it("get_frontmost_window returns a WindowInfo", async () => {
    if (!permsOk) return;
    const win = await bridge.getFrontmostWindow();
    expect(win).toHaveProperty("appName");
    expect(win).toHaveProperty("pid");
    expect(win).toHaveProperty("title");
    expect(win).toHaveProperty("frame");
    expect(typeof win.pid).toBe("number");
    expect(win.isFrontmost).toBe(true);
  });

  it("keyPress round-trips (innocuous key)", async () => {
    if (!permsOk) return;
    // Send an arrow-up to the currently-focused app. Calc etc don't care; text editors move cursor.
    await expect(bridge.keyPress({ key: "up" })).resolves.toBeUndefined();
  });

  it("scroll round-trips", async () => {
    if (!permsOk) return;
    // 0-line scroll is a no-op but still dispatches the event
    await expect(bridge.scroll({ direction: "down", amount: 0 })).resolves.toBeUndefined();
  });
});
