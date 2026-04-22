#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperDest = path.join(os.homedir(), ".mcp-computer-use", "bridge");
const sourcePath = path.join(rootDir, "native", "macos", "bridge.swift");

const args = new Set(process.argv.slice(2));
const isPostinstall = args.has("--postinstall");

async function exists(p) {
  try { await fs.access(p, fsConstants.F_OK); return true; } catch { return false; }
}

async function isExecutable(p) {
  try { await fs.access(p, fsConstants.X_OK); return true; } catch { return false; }
}

async function run(cmd, cmdArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} failed (${code})`))
    );
  });
}

async function build() {
  if (!(await exists(sourcePath))) {
    throw new Error(`Swift source missing: ${sourcePath}`);
  }
  await fs.mkdir(path.dirname(helperDest), { recursive: true });
  await run("xcrun", [
    "swiftc", "-O",
    "-framework", "ApplicationServices",
    "-framework", "AppKit",
    "-framework", "ScreenCaptureKit",
    "-framework", "Foundation",
    sourcePath, "-o", helperDest,
  ]);
  await fs.chmod(helperDest, 0o755);
}

async function setup() {
  if (process.platform !== "darwin") {
    console.error("[mcp-computer-use] platform is not macOS; skipping helper install.");
    return;
  }

  if (await isExecutable(helperDest)) {
    console.error(`[mcp-computer-use] helper already installed at ${helperDest}`);
    return;
  }

  console.error("[mcp-computer-use] building native helper from source...");
  await build();
  console.error(`[mcp-computer-use] helper ready at ${helperDest}`);
  console.error(
    "[mcp-computer-use] On first run, macOS will ask you to grant Accessibility AND Screen Recording to the helper binary. Required. Revoke in System Settings → Privacy & Security when not in use."
  );
}

setup().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (isPostinstall) {
    // Don't fail npm install on build errors (missing Xcode CLT etc.) — defer to first run.
    console.error(`[mcp-computer-use] postinstall helper setup skipped: ${msg}`);
    console.error("[mcp-computer-use] Run: npm run build:native — after installing Xcode CLT (xcode-select --install).");
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
});
