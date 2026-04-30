#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(rootDir, "native", "macos");

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

function archDir() {
  return process.arch === "arm64"
    ? "arm64-apple-macosx"
    : "x86_64-apple-macosx";
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("build-native is only supported on macOS.");
  }
  const outputPath =
    getArg("--output") ?? path.join(os.homedir(), ".mcp-computer-use", "bridge");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  console.error(`[mcp-computer-use] Building native helper via swift build → ${outputPath}`);
  await run("swift", ["build", "-c", "release", "--package-path", packageDir]);

  const builtBinary = path.join(packageDir, ".build", archDir(), "release", "McpComputerUseHelper");
  await fs.copyFile(builtBinary, outputPath);
  await fs.chmod(outputPath, 0o755);
  console.error(`[mcp-computer-use] Built helper at ${outputPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
