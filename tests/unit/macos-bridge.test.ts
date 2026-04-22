import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MacosBridge } from "../../src/native/macos-bridge.js";
import type { Config } from "../../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_HELPER = path.resolve(__dirname, "..", "fixtures", "mock-helper.mjs");

function makeConfig(): Config {
  return {
    strictAx: true, allowAll: false, allowedApps: [],
    auditEnabled: false, auditPath: "/tmp/audit.log",
    rateLimitMs: 0, secretScan: false, redact: false,
    redactApps: [], confirm: false, readonly: false,
  };
}

function newBridge(env: NodeJS.ProcessEnv = {}) {
  return new MacosBridge(makeConfig(), {
    helperPath: process.execPath,
    helperArgs: [MOCK_HELPER],
    env,
  });
}

describe("MacosBridge IPC (camelCase, composed)", () => {
  let bridge: MacosBridge | undefined;

  afterEach(async () => {
    await bridge?.shutdown();
    bridge = undefined;
  });

  it("checkPermissions round-trips", async () => {
    bridge = newBridge();
    const perm = await bridge.checkPermissions();
    expect(perm).toEqual({ accessibility: true, screenRecording: true });
  });

  it("listWindows returns enriched WindowInfo[]", async () => {
    bridge = newBridge();
    const wins = await bridge.listWindows("md.obsidian");
    expect(wins).toHaveLength(1);
    expect(wins[0].bundleId).toBe("md.obsidian");
    expect(wins[0].pid).toBe(123);
    expect(wins[0].title).toBe("vault");
    expect(wins[0].frame).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("getFrontmostWindow composes full WindowInfo", async () => {
    bridge = newBridge();
    const win = await bridge.getFrontmostWindow();
    expect(win.bundleId).toBe("md.obsidian");
    expect(win.title).toBe("vault");
    expect(win.isFrontmost).toBe(true);
    expect(win.frame.width).toBe(800);
  });

  it("screenshot resolves target, generates captureId, enables subsequent click", async () => {
    bridge = newBridge();
    const shot = await bridge.screenshot({ app: "md.obsidian" });
    expect(shot.target.bundleId).toBe("md.obsidian");
    expect(shot.target.windowId).toBe(1);
    expect(shot.capture.captureId).toMatch(/^cap_[a-f0-9-]+/);
    expect(shot.capture.width).toBe(800);
    expect(shot.pngBase64.length).toBeGreaterThan(0);

    // Click using the captureId should resolve internal state
    await expect(bridge.click({ x: 50, y: 50, captureId: shot.capture.captureId })).resolves.toBeUndefined();
  });

  it("click rejects stale captureId with stale_capture_id error", async () => {
    bridge = newBridge();
    await expect(
      bridge.click({ x: 10, y: 10, captureId: "nonexistent" })
    ).rejects.toMatchObject({ name: "HelperCommandError", code: "stale_capture_id" });
  });

  it("propagates Swift-side errors as HelperCommandError", async () => {
    bridge = newBridge({
      MOCK_HELPER_ERRORS: JSON.stringify({
        mouseClick: { code: "coord_out_of_bounds", message: "out of bounds" },
      }),
    });
    const shot = await bridge.screenshot({ app: "md.obsidian" });
    await expect(
      bridge.click({ x: 9999, y: 9999, captureId: shot.capture.captureId })
    ).rejects.toMatchObject({ name: "HelperCommandError", code: "coord_out_of_bounds" });
  });

  it("keyPress and scroll round-trip without requiring captureId", async () => {
    bridge = newBridge();
    await expect(bridge.keyPress({ key: "return" })).resolves.toBeUndefined();
    await expect(bridge.scroll({ direction: "down", amount: 3 })).resolves.toBeUndefined();
  });

  it("serialises concurrent requests", async () => {
    bridge = newBridge();
    const results = await Promise.all([
      bridge.checkPermissions(),
      bridge.listWindows("md.obsidian"),
      bridge.getFrontmostWindow(),
    ]);
    expect(results[0].accessibility).toBe(true);
    expect(results[1]).toHaveLength(1);
    expect(results[2].bundleId).toBe("md.obsidian");
  });
});
