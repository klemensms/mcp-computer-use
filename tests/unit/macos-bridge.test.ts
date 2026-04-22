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

describe("MacosBridge IPC", () => {
  let bridge: MacosBridge | undefined;

  afterEach(async () => {
    await bridge?.shutdown();
    bridge = undefined;
  });

  it("checkPermissions round-trips via stdio", async () => {
    bridge = new MacosBridge(makeConfig(), {
      helperPath: process.execPath,
      helperArgs: [MOCK_HELPER],
    });
    const perm = await bridge.checkPermissions();
    expect(perm).toEqual({ accessibility: true, screenRecording: true });
  });

  it("listWindows returns array", async () => {
    bridge = new MacosBridge(makeConfig(), {
      helperPath: process.execPath,
      helperArgs: [MOCK_HELPER],
    });
    const wins = await bridge.listWindows();
    expect(wins).toHaveLength(1);
    expect(wins[0].bundleId).toBe("md.obsidian");
  });

  it("screenshot returns capture info + PNG", async () => {
    bridge = new MacosBridge(makeConfig(), {
      helperPath: process.execPath,
      helperArgs: [MOCK_HELPER],
    });
    const shot = await bridge.screenshot({});
    expect(shot.capture.captureId).toBe("cap_mock_1");
    expect(shot.pngBase64.length).toBeGreaterThan(0);
  });

  it("propagates helper errors as HelperCommandError", async () => {
    bridge = new MacosBridge(makeConfig(), {
      helperPath: process.execPath,
      helperArgs: [MOCK_HELPER],
      env: {
        MOCK_HELPER_ERRORS: JSON.stringify({
          click: { code: "coord_out_of_bounds", message: "out of bounds" },
        }),
      },
    });
    await expect(
      bridge.click({ x: 9999, y: 9999, captureId: "cap_mock_1" })
    ).rejects.toMatchObject({ name: "HelperCommandError", code: "coord_out_of_bounds" });
  });

  it("serialises concurrent requests (no response interleaving)", async () => {
    bridge = new MacosBridge(makeConfig(), {
      helperPath: process.execPath,
      helperArgs: [MOCK_HELPER],
    });
    const results = await Promise.all([
      bridge.checkPermissions(),
      bridge.listWindows(),
      bridge.getFrontmostWindow(),
    ]);
    expect(results[0].accessibility).toBe(true);
    expect(results[1]).toHaveLength(1);
    expect(results[2].bundleId).toBe("md.obsidian");
  });
});
