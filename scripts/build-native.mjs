#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(rootDir, "native", "macos", "bridge.swift");

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function run(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} failed (${code})`))
    );
  });
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("build-native is only supported on macOS.");
  }
  const outputPath =
    getArg("--output") ?? path.join(os.homedir(), ".mcp-computer-use", "bridge");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const swiftArgs = [
    "swiftc", "-O",
    "-framework", "ApplicationServices",
    "-framework", "AppKit",
    "-framework", "ScreenCaptureKit",
    "-framework", "Foundation",
    sourcePath,
    "-o", outputPath,
  ];

  console.error(`[mcp-computer-use] Building native helper → ${outputPath}`);
  await run("xcrun", swiftArgs);
  await fs.chmod(outputPath, 0o755);
  console.error(`[mcp-computer-use] Built helper at ${outputPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
