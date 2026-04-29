#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperDest = path.join(os.homedir(), ".mcp-computer-use", "bridge");
const packageDir = path.join(rootDir, "native", "macos");
const manifestPath = path.join(packageDir, "Package.swift");

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

function archDir() {
  return process.arch === "arm64"
    ? "arm64-apple-macosx"
    : "x86_64-apple-macosx";
}

async function build() {
  if (!(await exists(manifestPath))) {
    throw new Error(`SwiftPM manifest missing: ${manifestPath}`);
  }
  await fs.mkdir(path.dirname(helperDest), { recursive: true });
  await run("swift", ["build", "-c", "release", "--package-path", packageDir]);
  const builtBinary = path.join(packageDir, ".build", archDir(), "release", "McpComputerUseHelper");
  await fs.copyFile(builtBinary, helperDest);
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

  console.error("[mcp-computer-use] building native helper via SwiftPM...");
  await build();
  console.error(`[mcp-computer-use] helper ready at ${helperDest}`);
  console.error(
    "[mcp-computer-use] On first run, macOS will ask you to grant Accessibility AND Screen Recording to the helper binary. Required. Revoke in System Settings → Privacy & Security when not in use."
  );
  console.error(
    "[mcp-computer-use] After upgrading from a previous version, permissions may re-prompt once because the binary identity has changed."
  );
}

setup().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (isPostinstall) {
    // Don't fail npm install on build errors (missing Xcode etc.) — defer to first run.
    console.error(`[mcp-computer-use] postinstall helper setup skipped: ${msg}`);
    console.error("[mcp-computer-use] Run: npm run build:native — full Xcode required for `swift build`.");
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
});
