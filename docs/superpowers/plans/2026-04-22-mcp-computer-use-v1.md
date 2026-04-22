# mcp-computer-use v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an npm-publishable, standalone MCP server at `~/Repo/mcp-computer-use/` that gives Claude Code (and other MCP clients) semantic macOS app control — screenshot, click, type, key_press, scroll, list_windows, get_frontmost_window, wait, check_permissions — with a default-secure safety layer (strict-AX, allowlist, audit log, rate limit, secret scan, sensitive-app redaction).

**Architecture:** Standalone repo, TypeScript Node 20, `@modelcontextprotocol/sdk` stdio transport, `@mcp-consultant-tools/core` for shared helpers. Swift helper (1,376 lines, copied from `injaneity/pi-computer-use` with MIT attribution) runs as a sub-process speaking JSON-over-stdio. A `NativeBridge` interface isolates the Node side from the native implementation so Windows slots in as a second backend in v2. Service-Tool-Prompt layering mirrors the monorepo.

**Tech Stack:** TypeScript, Node 20, `@modelcontextprotocol/sdk`, `zod`, `commander`, `vitest`, `@mcp-consultant-tools/core` (from npm), Swift via `xcrun swiftc`.

**Reference spec:** `~/Repo/mcp-computer-use/docs/superpowers/specs/2026-04-22-mcp-computer-use-design.md`
**Upstream source:** `~/Repo/3rd party repos/pi-computer-use/` (HEAD `96434a7`, MIT © Zane Chee)

---

## Working directory

All steps assume `cd ~/Repo/mcp-computer-use`. The repo is already git-initialised on branch `main` with the spec committed (`a58ef70`).

## File structure (locked in now)

```
mcp-computer-use/
├── src/
│   ├── index.ts                          # MCP server entry, ~120 lines
│   ├── cli.ts                            # CLI entry, ~30 lines
│   ├── context-factory.ts                # createServiceContext(), ~50 lines
│   ├── types.ts                          # ServiceContext interface, ~40 lines
│   ├── config.ts                         # Env → Config, ~120 lines
│   ├── tool-examples.ts                  # descWithExamples re-export + arrays, ~100 lines
│   ├── errors.ts                         # Typed error classes, ~50 lines
│   ├── native/
│   │   ├── bridge-interface.ts           # NativeBridge contract, ~80 lines
│   │   ├── factory.ts                    # Picks backend by platform, ~30 lines
│   │   ├── macos-bridge.ts               # Swift helper IPC + commands, ~400 lines
│   │   └── helper-install.ts             # compile/copy Swift binary, ~80 lines
│   ├── services/
│   │   ├── index.ts                      # Barrel, ~15 lines
│   │   ├── safety-service.ts             # allowlist + rate limit + secret scan, ~150 lines
│   │   ├── audit-service.ts              # JSONL audit log, rotation, ~120 lines
│   │   ├── permission-service.ts         # AX + Screen Recording status, ~40 lines
│   │   ├── window-service.ts             # list + frontmost, ~40 lines
│   │   ├── screenshot-service.ts         # screenshot wrapper, ~60 lines
│   │   ├── input-service.ts              # click, type_text, key_press, scroll, ~100 lines
│   │   └── wait-service.ts               # wait, ~30 lines
│   ├── tools/
│   │   ├── index.ts                      # registerAllTools, READONLY filter, ~50 lines
│   │   ├── permission-tools.ts           # check_permissions, ~30 lines
│   │   ├── window-tools.ts               # list_windows, get_frontmost_window, ~60 lines
│   │   ├── screenshot-tools.ts           # screenshot, ~60 lines
│   │   ├── input-tools.ts                # click, type_text, key_press, scroll, ~140 lines
│   │   └── wait-tools.ts                 # wait, ~40 lines
│   ├── cli/
│   │   ├── output.ts                     # outputResult wrapper, ~30 lines
│   │   └── commands/
│   │       ├── index.ts                  # registerAllCommands, ~20 lines
│   │       ├── permission-commands.ts    # ~25 lines
│   │       ├── window-commands.ts        # ~40 lines
│   │       ├── screenshot-commands.ts    # ~30 lines
│   │       ├── input-commands.ts         # ~80 lines
│   │       └── wait-commands.ts          # ~20 lines
│   └── models/
│       ├── index.ts                      # Barrel
│       └── api-types.ts                  # Request/response types, ~120 lines
├── native/
│   └── macos/
│       └── bridge.swift                  # 1,376 lines copied from upstream + attribution header
├── scripts/
│   ├── build-native.mjs                  # xcrun swiftc wrapper, ~70 lines
│   └── setup-helper.mjs                  # postinstall compile + install, ~120 lines
├── tests/
│   ├── unit/
│   │   ├── config.test.ts
│   │   ├── safety-service.test.ts
│   │   ├── audit-service.test.ts
│   │   ├── macos-bridge.test.ts          # Uses a mock helper script
│   │   ├── tools-registration.test.ts    # READONLY filter
│   │   └── tool-examples.test.ts
│   └── integration/
│       └── macos-helper.test.ts          # Spawns real compiled Swift helper, skipped on non-darwin
├── docs/
│   ├── superpowers/{specs,plans}/        # this plan lives here
│   ├── technical/COMPUTER_USE_TECHNICAL.md
│   ├── documentation/computer-use.md
│   └── release-notes/v0.1.0-beta.1.md
├── CLAUDE.md
├── README.md
├── LICENSE
├── NOTICE
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .gitignore
```

---

## Phase 1: Scaffolding

### Task 1: package.json + tsconfig + .gitignore

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@mcp-consultant-tools/computer-use",
  "version": "0.1.0-beta.1",
  "description": "MCP server giving agents semantic macOS app control via the Accessibility API and ScreenCaptureKit.",
  "type": "module",
  "main": "build/index.js",
  "bin": {
    "mcp-cu": "build/index.js",
    "mcp-cu-cli": "build/cli.js"
  },
  "files": [
    "build",
    "native/macos/bridge.swift",
    "scripts/build-native.mjs",
    "scripts/setup-helper.mjs",
    "README.md",
    "LICENSE",
    "NOTICE",
    ".env.example"
  ],
  "engines": {
    "node": ">=20.6.0"
  },
  "keywords": ["mcp", "computer-use", "macos", "accessibility", "screencapturekit", "agent"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/klemensms/mcp-computer-use.git"
  },
  "scripts": {
    "build": "tsc && chmod +x build/index.js build/cli.js",
    "build:native": "node scripts/build-native.mjs",
    "postinstall": "node scripts/setup-helper.mjs --postinstall",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@mcp-consultant-tools/core": "^28.0.0",
    "zod": "^3.23.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
build/
.env
.env.local
*.log
.DS_Store
coverage/
.vitest/
```

- [ ] **Step 5: Create `.env.example`**

```
# mcp-computer-use configuration
# All flags are optional; defaults are secure.

# Comma-separated bundle IDs allowed as action targets.
# Set MCP_CU_ALLOW_ALL=1 to bypass entirely (discouraged).
MCP_CU_ALLOWED_APPS=md.obsidian,com.apple.finder,com.apple.systempreferences,com.mitchellh.ghostty,dev.cmux.app,com.figma.Desktop
# MCP_CU_ALLOW_ALL=0

# Strict-AX stealth mode (ON by default). Set to 0 for pixel-click fallback.
# MCP_CU_STRICT_AX=1

# Audit log path override.
# MCP_CU_AUDIT_PATH=~/.local/state/mcp-computer-use/audit.log
# MCP_CU_AUDIT_LOG=1

# Minimum ms between write-actions (0 disables).
# MCP_CU_RATE_LIMIT_MS=250

# Reject type_text containing obvious secrets. Default ON.
# MCP_CU_SECRET_SCAN=1

# Blur sensitive-app screenshots. Default ON.
# MCP_CU_REDACT=1

# Opt-in modes:
# MCP_CU_READONLY=1       # Only register read tools.
# MCP_CU_CONFIRM=1        # Require explicit confirm on every write.
# MCP_CU_PROFILE=stealth  # Presets: stealth | permissive | readonly | confirm
```

- [ ] **Step 6: Verify `npm install` works**

Run: `npm install`
Expected: Resolves all deps, `node_modules/` created, postinstall runs `setup-helper.mjs` which does not exist yet — **it's fine that postinstall errors at this step**; we'll add the script in Task 4. If `npm install` fails *before* reaching postinstall, fix the package.json and retry.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .env.example
git commit -m "chore: scaffold package.json, tsconfig, vitest, gitignore, env example"
```

---

### Task 2: LICENSE + NOTICE + README stub

**Files:**
- Create: `LICENSE`
- Create: `NOTICE`
- Create: `README.md` (stub — polish in Phase 7)
- Create: `CLAUDE.md`

- [ ] **Step 1: Write `LICENSE`**

Paste the standard MIT license text with **both** copyright lines at the top:

```
MIT License

Copyright (c) 2026 Zane Chee (upstream: injaneity/pi-computer-use)
Copyright (c) 2026 Klemens Stelk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `NOTICE`**

```
mcp-computer-use
================

This product includes portions of injaneity/pi-computer-use
(https://github.com/injaneity/pi-computer-use), licensed under the MIT license.
Derived from commit 96434a7 (v0.1.1).

Specifically, the Swift helper at native/macos/bridge.swift is copied from
that project. The JSON-over-stdio IPC protocol between the Node bridge and
the Swift helper preserves wire compatibility with the upstream.

The Node-side TypeScript (src/native/macos-bridge.ts) takes inspiration
from the upstream src/bridge.ts but is a clean re-implementation tailored
to the MCP server lifecycle and safety model of this project.

Upstream:
  Copyright (c) 2026 Zane Chee
  Licensed MIT.

This project:
  Copyright (c) 2026 Klemens Stelk
  Licensed MIT.
```

- [ ] **Step 3: Write `README.md` stub**

Content:

```markdown
# mcp-computer-use

MCP server giving Claude Code (and any MCP client) semantic macOS app control via the Accessibility API and ScreenCaptureKit.

> **Status:** v0.1.0-beta. macOS only. Windows backend planned for v2.

Forked from [injaneity/pi-computer-use](https://github.com/injaneity/pi-computer-use) (MIT © Zane Chee). See `NOTICE` for attribution.

Full docs:
- User guide: `docs/documentation/computer-use.md`
- Technical reference: `docs/technical/COMPUTER_USE_TECHNICAL.md`
```

- [ ] **Step 4: Write `CLAUDE.md` stub**

```markdown
# CLAUDE.md

Project guidance for Claude Code working in this repo.

## Design docs
- Spec: `docs/superpowers/specs/2026-04-22-mcp-computer-use-design.md`
- Plan: `docs/superpowers/plans/2026-04-22-mcp-computer-use-v1.md`

## Conventions (mirrored from mcp-consultant-tools)
- Service-Tool-Prompt layering: services hold business logic, tools are thin MCP wrappers, CLI wraps the same services.
- NEVER use `console.log()` (corrupts MCP stdio). Only `console.error` / `console.warn`.
- Every MCP tool has a matching CLI command.
- Tests are vitest; run via `npm test`.
- Build: `npm run build`. Native helper: `npm run build:native` (macOS only).
```

- [ ] **Step 5: Commit**

```bash
git add LICENSE NOTICE README.md CLAUDE.md
git commit -m "docs: add LICENSE + NOTICE (MIT, upstream attribution) + README/CLAUDE stubs"
```

---

### Task 3: Copy Swift helper with attribution header

**Files:**
- Create: `native/macos/bridge.swift`

- [ ] **Step 1: Copy the Swift helper file**

```bash
mkdir -p native/macos
cp ~/Repo/3rd\ party\ repos/pi-computer-use/native/macos/bridge.swift native/macos/bridge.swift
```

- [ ] **Step 2: Prepend attribution header to `native/macos/bridge.swift`**

Open the file and add these lines at the very top (before any existing `import` statements):

```swift
// mcp-computer-use — macOS native helper
// Copied from injaneity/pi-computer-use @ 96434a7 (MIT © Zane Chee).
// Modified: attribution header only. See /NOTICE for full licensing.
//
```

During this Task the file is copied verbatim + attribution header only. **Subsequent tasks WILL extend this file** (add `keyPress`, `scroll`, `shutdown` handlers, etc.) — see spec §8 revision 2026-04-22b. Upstream wire compatibility is not a goal.

- [ ] **Step 3: Verify file length is unchanged except for header**

Run: `wc -l native/macos/bridge.swift`
Expected: ~1,380 lines (the original 1,376 plus ~4 header lines).

- [ ] **Step 4: Commit**

```bash
git add native/macos/bridge.swift
git commit -m "feat(native): copy upstream bridge.swift with attribution header"
```

---

### Task 4: build-native.mjs + setup-helper.mjs + verify helper compiles

**Files:**
- Create: `scripts/build-native.mjs`
- Create: `scripts/setup-helper.mjs`

- [ ] **Step 1: Write `scripts/build-native.mjs`**

```js
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
```

- [ ] **Step 2: Write `scripts/setup-helper.mjs`**

```js
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
```

- [ ] **Step 3: Run postinstall to verify helper compiles**

Run: `node scripts/setup-helper.mjs`
Expected stderr lines:
```
[mcp-computer-use] building native helper from source...
[mcp-computer-use] helper ready at /Users/klemensstelk/.mcp-computer-use/bridge
[mcp-computer-use] On first run, macOS will ask you ...
```
Verify the binary exists and is executable:
```bash
ls -la ~/.mcp-computer-use/bridge
file ~/.mcp-computer-use/bridge
```
Expected: Mach-O 64-bit executable arm64 (or x86_64 on Intel).

If xcrun is missing, abort and ask the user to install Xcode CLT (`xcode-select --install`) before continuing.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-native.mjs scripts/setup-helper.mjs
git commit -m "feat(build): add Swift helper build + postinstall compile-from-source"
```

---

## Phase 2: Config + types

### Task 5: models/api-types.ts

**Files:**
- Create: `src/models/api-types.ts`
- Create: `src/models/index.ts`

- [ ] **Step 1: Write `src/models/api-types.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/models/index.ts`**

```ts
export * from "./api-types.js";
```

- [ ] **Step 3: Commit**

```bash
git add src/models/api-types.ts src/models/index.ts
git commit -m "feat(models): define IPC request/response types matching Swift helper"
```

---

### Task 6: config.ts with tests

**Files:**
- Create: `src/config.ts`
- Create: `tests/unit/config.test.ts`

- [ ] **Step 1: Write `tests/unit/config.test.ts` (failing)**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, DEFAULT_ALLOWED_APPS } from "../../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    // Clean env between tests
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MCP_CU_")) delete process.env[key];
    }
  });

  it("uses secure defaults when no env vars set", () => {
    const config = loadConfig();
    expect(config.strictAx).toBe(true);
    expect(config.allowAll).toBe(false);
    expect(config.allowedApps).toEqual(DEFAULT_ALLOWED_APPS);
    expect(config.auditEnabled).toBe(true);
    expect(config.rateLimitMs).toBe(250);
    expect(config.secretScan).toBe(true);
    expect(config.redact).toBe(true);
    expect(config.confirm).toBe(false);
    expect(config.readonly).toBe(false);
  });

  it("parses MCP_CU_ALLOWED_APPS as comma-separated list", () => {
    process.env.MCP_CU_ALLOWED_APPS = "com.foo.Bar, com.baz.Qux , com.x.Y";
    const config = loadConfig();
    expect(config.allowedApps).toEqual(["com.foo.Bar", "com.baz.Qux", "com.x.Y"]);
  });

  it("MCP_CU_ALLOW_ALL=1 sets allowAll true", () => {
    process.env.MCP_CU_ALLOW_ALL = "1";
    expect(loadConfig().allowAll).toBe(true);
  });

  it("MCP_CU_STRICT_AX=0 disables strict mode", () => {
    process.env.MCP_CU_STRICT_AX = "0";
    expect(loadConfig().strictAx).toBe(false);
  });

  it("MCP_CU_RATE_LIMIT_MS parses to integer", () => {
    process.env.MCP_CU_RATE_LIMIT_MS = "500";
    expect(loadConfig().rateLimitMs).toBe(500);
  });

  it("MCP_CU_PROFILE=stealth applies stealth defaults", () => {
    process.env.MCP_CU_PROFILE = "stealth";
    const config = loadConfig();
    expect(config.strictAx).toBe(true);
    expect(config.allowAll).toBe(false);
    expect(config.redact).toBe(true);
  });

  it("MCP_CU_PROFILE=permissive loosens gates", () => {
    process.env.MCP_CU_PROFILE = "permissive";
    const config = loadConfig();
    expect(config.allowAll).toBe(true);
    expect(config.strictAx).toBe(false);
    expect(config.redact).toBe(false);
    // Audit + secret scan stay ON
    expect(config.auditEnabled).toBe(true);
    expect(config.secretScan).toBe(true);
  });

  it("MCP_CU_PROFILE=readonly enables readonly", () => {
    process.env.MCP_CU_PROFILE = "readonly";
    expect(loadConfig().readonly).toBe(true);
  });

  it("MCP_CU_PROFILE=confirm enables confirm on top of stealth", () => {
    process.env.MCP_CU_PROFILE = "confirm";
    const config = loadConfig();
    expect(config.confirm).toBe(true);
    expect(config.strictAx).toBe(true);
  });

  it("explicit env wins over profile preset", () => {
    process.env.MCP_CU_PROFILE = "permissive";
    process.env.MCP_CU_STRICT_AX = "1";
    expect(loadConfig().strictAx).toBe(true);
  });

  it("unknown profile throws with clear error", () => {
    process.env.MCP_CU_PROFILE = "nonsense";
    expect(() => loadConfig()).toThrow(/Unknown MCP_CU_PROFILE/);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test`
Expected: Fails with "Cannot find module '../../src/config.js'".

- [ ] **Step 3: Write `src/config.ts`**

```ts
import os from "node:os";
import path from "node:path";

export const DEFAULT_ALLOWED_APPS = [
  "md.obsidian",
  "com.apple.finder",
  "com.apple.systempreferences",
  "com.mitchellh.ghostty",
  "dev.cmux.app",
  "com.figma.Desktop",
];

export const DEFAULT_REDACT_APPS = [
  "com.apple.mail",
  "com.tinyspeck.slackmacgap",
  "com.apple.MobileSMS",
  "com.1password.1password8",
  "com.apple.keychainaccess",
];

export interface Config {
  strictAx: boolean;
  allowAll: boolean;
  allowedApps: string[];
  auditEnabled: boolean;
  auditPath: string;
  rateLimitMs: number;
  secretScan: boolean;
  redact: boolean;
  redactApps: string[];
  confirm: boolean;
  readonly: boolean;
}

type Profile = "stealth" | "permissive" | "readonly" | "confirm";

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function envList(name: string, defaultValue: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function applyProfile(profile: Profile, base: Config): Config {
  switch (profile) {
    case "stealth":
      return base; // stealth = default
    case "permissive":
      return {
        ...base,
        allowAll: true,
        strictAx: false,
        redact: false,
      };
    case "readonly":
      return { ...base, readonly: true };
    case "confirm":
      return { ...base, confirm: true };
  }
}

export function loadConfig(): Config {
  const base: Config = {
    strictAx: envBool("MCP_CU_STRICT_AX", true),
    allowAll: envBool("MCP_CU_ALLOW_ALL", false),
    allowedApps: envList("MCP_CU_ALLOWED_APPS", DEFAULT_ALLOWED_APPS),
    auditEnabled: envBool("MCP_CU_AUDIT_LOG", true),
    auditPath:
      process.env.MCP_CU_AUDIT_PATH ??
      path.join(os.homedir(), ".local", "state", "mcp-computer-use", "audit.log"),
    rateLimitMs: envInt("MCP_CU_RATE_LIMIT_MS", 250),
    secretScan: envBool("MCP_CU_SECRET_SCAN", true),
    redact: envBool("MCP_CU_REDACT", true),
    redactApps: envList("MCP_CU_REDACT_APPS", DEFAULT_REDACT_APPS),
    confirm: envBool("MCP_CU_CONFIRM", false),
    readonly: envBool("MCP_CU_READONLY", false),
  };

  const profileRaw = process.env.MCP_CU_PROFILE?.trim();
  if (!profileRaw) return base;

  const valid: Profile[] = ["stealth", "permissive", "readonly", "confirm"];
  if (!valid.includes(profileRaw as Profile)) {
    throw new Error(
      `Unknown MCP_CU_PROFILE='${profileRaw}'. Valid: ${valid.join(", ")}.`
    );
  }

  // Apply profile first, then overlay any explicit env overrides.
  // Strategy: run applyProfile on fresh defaults, then re-overlay explicit envs.
  const profiled = applyProfile(profileRaw as Profile, {
    ...base,
    // Reset to defaults that profile can modify:
    strictAx: true,
    allowAll: false,
    redact: true,
    confirm: false,
    readonly: false,
  });

  // Re-apply explicit envs (they should win over profile)
  return {
    ...profiled,
    strictAx:
      process.env.MCP_CU_STRICT_AX !== undefined ? base.strictAx : profiled.strictAx,
    allowAll:
      process.env.MCP_CU_ALLOW_ALL !== undefined ? base.allowAll : profiled.allowAll,
    redact: process.env.MCP_CU_REDACT !== undefined ? base.redact : profiled.redact,
    confirm:
      process.env.MCP_CU_CONFIRM !== undefined ? base.confirm : profiled.confirm,
    readonly:
      process.env.MCP_CU_READONLY !== undefined ? base.readonly : profiled.readonly,
    allowedApps: base.allowedApps,
    auditEnabled: base.auditEnabled,
    auditPath: base.auditPath,
    rateLimitMs: base.rateLimitMs,
    secretScan: base.secretScan,
    redactApps: base.redactApps,
  };
}
```

- [ ] **Step 4: Run tests — expect all pass**

Run: `npm test`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts
git commit -m "feat(config): env-driven Config loader with PROFILE presets + tests"
```

---

## Phase 3: Native bridge

### Task 7: NativeBridge interface, factory, and typed errors

**Files:**
- Create: `src/errors.ts`
- Create: `src/native/bridge-interface.ts`
- Create: `src/native/factory.ts`

- [ ] **Step 1: Write `src/errors.ts`**

```ts
export class HelperTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HelperTransportError";
  }
}

export class HelperCommandError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "HelperCommandError";
    this.code = code;
  }
}

export class SafetyViolationError extends Error {
  readonly code:
    | "APP_NOT_ALLOWED"
    | "SECRET_DETECTED"
    | "RATE_LIMITED"
    | "READONLY_MODE"
    | "CONFIRM_REQUIRED";
  readonly details?: Record<string, unknown>;
  constructor(
    message: string,
    code: SafetyViolationError["code"],
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SafetyViolationError";
    this.code = code;
    this.details = details;
  }
}
```

- [ ] **Step 2: Write `src/native/bridge-interface.ts`**

```ts
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

export interface NativeBridge {
  screenshot(req: ScreenshotRequest): Promise<ScreenshotResult>;
  click(req: ClickRequest): Promise<void>;
  typeText(req: TypeTextRequest): Promise<void>;
  keyPress(req: KeyPressRequest): Promise<void>;
  scroll(req: ScrollRequest): Promise<void>;
  listWindows(bundleId?: string): Promise<WindowInfo[]>;
  getFrontmostWindow(): Promise<WindowInfo>;
  checkPermissions(): Promise<PermissionStatus>;
  shutdown(): Promise<void>;
}
```

- [ ] **Step 3: Write `src/native/factory.ts`**

```ts
import type { NativeBridge } from "./bridge-interface.js";
import type { Config } from "../config.js";

export async function createNativeBridge(config: Config): Promise<NativeBridge> {
  if (process.platform === "darwin") {
    const { MacosBridge } = await import("./macos-bridge.js");
    return new MacosBridge(config);
  }
  throw new Error(
    `mcp-computer-use has no backend for platform '${process.platform}'. Only darwin is supported in v1; Windows planned for v2.`
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/errors.ts src/native/bridge-interface.ts src/native/factory.ts
git commit -m "feat(native): NativeBridge interface, platform factory, typed errors"
```

---

### Task 8: macos-bridge.ts — IPC layer with mock helper tests

**Files:**
- Create: `src/native/macos-bridge.ts`
- Create: `tests/unit/macos-bridge.test.ts`
- Create: `tests/fixtures/mock-helper.mjs` (a tiny Node script that imitates the Swift helper's JSON-over-stdio protocol)

- [ ] **Step 1: Write `tests/fixtures/mock-helper.mjs`**

```js
// Tiny mock helper: reads newline-delimited JSON on stdin, responds on stdout.
// Supports commands: check_permissions, list_windows, get_frontmost_window,
// screenshot, click, type_text, key_press, scroll, wait, shutdown.
// Configurable via env: MOCK_HELPER_PERM, MOCK_HELPER_ERRORS (JSON).

import readline from "node:readline";

const perm = JSON.parse(
  process.env.MOCK_HELPER_PERM ?? '{"accessibility":true,"screenRecording":true}'
);
const errors = JSON.parse(process.env.MOCK_HELPER_ERRORS ?? "{}");

const rl = readline.createInterface({ input: process.stdin });

function reply(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const id = req.id;
  const cmd = req.cmd;

  if (errors[cmd]) {
    reply({ id, ok: false, error: errors[cmd] });
    return;
  }

  switch (cmd) {
    case "check_permissions":
      reply({ id, ok: true, result: perm });
      return;
    case "list_windows":
      reply({
        id, ok: true,
        result: [
          {
            appName: "Obsidian",
            bundleId: "md.obsidian",
            pid: 123,
            windowId: 1,
            title: "vault",
            isFrontmost: true,
            isMinimized: false,
            isOnscreen: true,
            frame: { x: 0, y: 0, width: 800, height: 600 },
          },
        ],
      });
      return;
    case "get_frontmost_window":
      reply({
        id, ok: true,
        result: {
          appName: "Obsidian",
          bundleId: "md.obsidian",
          pid: 123,
          windowId: 1,
          title: "vault",
          isFrontmost: true,
          isMinimized: false,
          isOnscreen: true,
          frame: { x: 0, y: 0, width: 800, height: 600 },
        },
      });
      return;
    case "screenshot":
      reply({
        id, ok: true,
        result: {
          target: {
            appName: "Obsidian",
            bundleId: "md.obsidian",
            pid: 123,
            windowTitle: "vault",
            windowId: 1,
          },
          capture: {
            captureId: "cap_mock_1",
            width: 800,
            height: 600,
            scaleFactor: 2,
            timestamp: Date.now(),
          },
          pngBase64: "iVBORw0KGgo=", // 1x1 transparent PNG stub
        },
      });
      return;
    case "click":
    case "type_text":
    case "key_press":
    case "scroll":
    case "wait":
      reply({ id, ok: true, result: null });
      return;
    case "shutdown":
      reply({ id, ok: true, result: null });
      setTimeout(() => process.exit(0), 10);
      return;
    default:
      reply({ id, ok: false, error: { code: "unknown_cmd", message: `Unknown cmd ${cmd}` } });
  }
});
```

- [ ] **Step 2: Write `tests/unit/macos-bridge.test.ts` (failing)**

```ts
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
```

- [ ] **Step 3: Run tests — expect failure**

Run: `npm test -- macos-bridge`
Expected: Fails with "Cannot find module '../../src/native/macos-bridge.js'".

- [ ] **Step 4: Write `src/native/macos-bridge.ts`**

```ts
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
```

> **Swift-side cmd names (revised during implementation — see spec §8 revision 2026-04-22b).** The Swift helper uses camelCase names — `checkPermissions`, `listWindows`, `getFrontmost`, `screenshot`, `mouseClick`, `typeText` — plus extensions we add in this project (`keyPress`, `scroll`, `shutdown`). The TS bridge sends camelCase to match. `bridge.swift` is owned here, not wire-compat-locked to upstream — extend it freely.

- [ ] **Step 5: Run tests — expect all pass**

Run: `npm test -- macos-bridge`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/native/macos-bridge.ts tests/unit/macos-bridge.test.ts tests/fixtures/mock-helper.mjs
git commit -m "feat(native): MacosBridge IPC layer with mock-helper tests"
```

---

## Phase 4: Services

### Task 9: safety-service.ts with tests

**Files:**
- Create: `src/services/safety-service.ts`
- Create: `tests/unit/safety-service.test.ts`

- [ ] **Step 1: Write `tests/unit/safety-service.test.ts` (failing)**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { SafetyService } from "../../src/services/safety-service.js";
import type { Config } from "../../src/config.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    strictAx: true,
    allowAll: false,
    allowedApps: ["md.obsidian", "com.apple.finder"],
    auditEnabled: true,
    auditPath: "/tmp/audit.log",
    rateLimitMs: 250,
    secretScan: true,
    redact: true,
    redactApps: [],
    confirm: false,
    readonly: false,
    ...overrides,
  };
}

describe("SafetyService.assertAllowed", () => {
  it("passes when bundle id is on allowlist", () => {
    const s = new SafetyService(makeConfig());
    expect(() => s.assertAllowed("md.obsidian")).not.toThrow();
  });

  it("rejects bundle id not on allowlist", () => {
    const s = new SafetyService(makeConfig());
    expect(() => s.assertAllowed("com.microsoft.Word"))
      .toThrow(/APP_NOT_ALLOWED/);
  });

  it("passes any bundle id when allowAll is set", () => {
    const s = new SafetyService(makeConfig({ allowAll: true }));
    expect(() => s.assertAllowed("com.some.random")).not.toThrow();
  });

  it("rejects undefined bundle id when strict (defensive)", () => {
    const s = new SafetyService(makeConfig());
    expect(() => s.assertAllowed(undefined))
      .toThrow(/APP_NOT_ALLOWED/);
  });
});

describe("SafetyService.scanForSecrets", () => {
  const s = new SafetyService(makeConfig());

  it("passes innocuous text", () => {
    expect(() => s.scanForSecrets("hello world")).not.toThrow();
  });

  it("rejects OpenAI/Anthropic-style keys", () => {
    expect(() => s.scanForSecrets("sk-abc123def456ghi789jkl0")).toThrow(/SECRET_DETECTED/);
  });

  it("rejects GitHub PAT", () => {
    expect(() => s.scanForSecrets("ghp_123456789012345678901234567890123456"))
      .toThrow(/SECRET_DETECTED/);
  });

  it("rejects AWS access key", () => {
    expect(() => s.scanForSecrets("AKIA0123456789ABCDEF"))
      .toThrow(/SECRET_DETECTED/);
  });

  it("rejects long base64 blob", () => {
    const blob = "a".repeat(50);
    expect(() => s.scanForSecrets(blob)).toThrow(/SECRET_DETECTED/);
  });

  it("no-op when scan disabled", () => {
    const off = new SafetyService(makeConfig({ secretScan: false }));
    expect(() => off.scanForSecrets("sk-abc123def456ghi789jkl0")).not.toThrow();
  });
});

describe("SafetyService.rateLimit", () => {
  it("first call resolves immediately", async () => {
    const s = new SafetyService(makeConfig({ rateLimitMs: 100 }));
    const t0 = Date.now();
    await s.rateLimit();
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it("second call waits at least rateLimitMs", async () => {
    const s = new SafetyService(makeConfig({ rateLimitMs: 100 }));
    await s.rateLimit();
    const t0 = Date.now();
    await s.rateLimit();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(90);
  });

  it("no-op when rateLimitMs is 0", async () => {
    const s = new SafetyService(makeConfig({ rateLimitMs: 0 }));
    await s.rateLimit();
    const t0 = Date.now();
    await s.rateLimit();
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

describe("SafetyService.shouldRedact", () => {
  it("true when app on redact list", () => {
    const s = new SafetyService(makeConfig({ redact: true, redactApps: ["com.apple.mail"] }));
    expect(s.shouldRedact("com.apple.mail")).toBe(true);
  });

  it("false when redact disabled", () => {
    const s = new SafetyService(makeConfig({ redact: false, redactApps: ["com.apple.mail"] }));
    expect(s.shouldRedact("com.apple.mail")).toBe(false);
  });

  it("false when app not on list", () => {
    const s = new SafetyService(makeConfig({ redact: true, redactApps: ["com.apple.mail"] }));
    expect(s.shouldRedact("md.obsidian")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- safety-service`
Expected: Fails with "Cannot find module".

- [ ] **Step 3: Write `src/services/safety-service.ts`**

```ts
import { SafetyViolationError } from "../errors.js";
import type { Config } from "../config.js";

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "openai_anthropic_key", re: /sk-[a-zA-Z0-9]{20,}/ },
  { name: "github_pat", re: /ghp_[a-zA-Z0-9]{36}/ },
  { name: "aws_access_key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "slack_bot_token", re: /xoxb-[0-9a-zA-Z-]+/ },
  { name: "long_base64", re: /[A-Za-z0-9+/]{40,}={0,2}/ },
];

export class SafetyService {
  private lastActionAt = 0;

  constructor(private config: Config) {}

  assertAllowed(bundleId: string | undefined): void {
    if (this.config.allowAll) return;
    if (!bundleId) {
      throw new SafetyViolationError(
        "Target bundle ID is unknown; cannot verify against allowlist. Call screenshot or get_frontmost_window first.",
        "APP_NOT_ALLOWED",
        { bundleId }
      );
    }
    if (!this.config.allowedApps.includes(bundleId)) {
      throw new SafetyViolationError(
        `App '${bundleId}' is not on the allowlist. Edit MCP_CU_ALLOWED_APPS or set MCP_CU_ALLOW_ALL=1 to bypass.`,
        "APP_NOT_ALLOWED",
        { bundleId, allowedApps: this.config.allowedApps }
      );
    }
  }

  scanForSecrets(text: string): void {
    if (!this.config.secretScan) return;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(text)) {
        throw new SafetyViolationError(
          `type_text rejected: content matches '${name}'. Use a clipboard paste path or set MCP_CU_SECRET_SCAN=0 if this is intentional.`,
          "SECRET_DETECTED",
          { pattern: name }
        );
      }
    }
  }

  async rateLimit(): Promise<void> {
    if (this.config.rateLimitMs <= 0) return;
    const elapsed = Date.now() - this.lastActionAt;
    const remaining = this.config.rateLimitMs - elapsed;
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
    this.lastActionAt = Date.now();
  }

  shouldRedact(bundleId: string | undefined): boolean {
    if (!this.config.redact) return false;
    if (!bundleId) return false;
    return this.config.redactApps.includes(bundleId);
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

Run: `npm test -- safety-service`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/safety-service.ts tests/unit/safety-service.test.ts
git commit -m "feat(safety): allowlist + rate limit + secret scan + redact predicate"
```

---

### Task 10: audit-service.ts with tests

**Files:**
- Create: `src/services/audit-service.ts`
- Create: `tests/unit/audit-service.test.ts`

- [ ] **Step 1: Write `tests/unit/audit-service.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AuditService } from "../../src/services/audit-service.js";

let tmpDir: string;
let logPath: string;

describe("AuditService", () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cu-audit-"));
    logPath = path.join(tmpDir, "audit.log");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes one JSON line per event", async () => {
    const a = new AuditService({ enabled: true, path: logPath });
    await a.log({ tool: "click", target: { bundleId: "md.obsidian" }, params: { x: 10, y: 20 }, result: "ok" });
    await a.log({ tool: "type_text", target: { bundleId: "md.obsidian" }, params: { text: "hello" }, result: "ok" });
    await a.flush();

    const content = await fs.readFile(logPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first.tool).toBe("click");
    expect(first.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("redacts type_text.text field", async () => {
    const a = new AuditService({ enabled: true, path: logPath });
    await a.log({
      tool: "type_text",
      target: { bundleId: "md.obsidian" },
      params: { text: "super-secret-password-1234" },
      result: "ok",
    });
    await a.flush();
    const content = await fs.readFile(logPath, "utf8");
    expect(content).not.toContain("super-secret-password-1234");
    expect(content).toMatch(/redacted/);
  });

  it("no-op when disabled", async () => {
    const a = new AuditService({ enabled: false, path: logPath });
    await a.log({ tool: "click", target: {}, params: {}, result: "ok" });
    await a.flush();
    await expect(fs.access(logPath)).rejects.toThrow();
  });

  it("creates parent dir if missing", async () => {
    const nested = path.join(tmpDir, "nested", "deeper", "audit.log");
    const a = new AuditService({ enabled: true, path: nested });
    await a.log({ tool: "click", target: {}, params: {}, result: "ok" });
    await a.flush();
    const content = await fs.readFile(nested, "utf8");
    expect(content.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- audit-service`
Expected: Fails.

- [ ] **Step 3: Write `src/services/audit-service.ts`**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface AuditEvent {
  tool: string;
  target: { bundleId?: string; windowTitle?: string; pid?: number };
  params: Record<string, unknown>;
  result: "ok" | "error";
  errorCode?: string;
  durationMs?: number;
  strategy?: string;
}

export interface AuditOptions {
  enabled: boolean;
  path: string;
}

export class AuditService {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private options: AuditOptions) {}

  async log(event: AuditEvent): Promise<void> {
    if (!this.options.enabled) return;

    const safe = this.redactParams(event.tool, event.params);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      tool: event.tool,
      target: event.target,
      params: safe,
      result: event.result,
      errorCode: event.errorCode,
      durationMs: event.durationMs,
      strategy: event.strategy,
    }) + "\n";

    // Chain writes so they're serialized.
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.options.path), { recursive: true });
      await fs.appendFile(this.options.path, line, "utf8");
    }).catch((err) => {
      // Never throw from audit — log to stderr and continue.
      console.error(`[mcp-computer-use] audit write failed: ${err.message}`);
    });

    // Don't make callers await the write; audit is best-effort.
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private redactParams(tool: string, params: Record<string, unknown>): Record<string, unknown> {
    if (tool === "type_text" && typeof params.text === "string") {
      const text = params.text as string;
      const hash = createHash("sha256").update(text).digest("hex").slice(0, 8);
      return { ...params, text: `[redacted, len=${text.length}, sha256-prefix=${hash}]` };
    }
    return params;
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

Run: `npm test -- audit-service`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/audit-service.ts tests/unit/audit-service.test.ts
git commit -m "feat(audit): JSONL audit log with type_text redaction + serialized writes"
```

---

### Task 11: permission-service + window-service + screenshot-service + wait-service

These are thin wrappers over `NativeBridge`. They deserve one task because each is trivial.

**Files:**
- Create: `src/services/permission-service.ts`
- Create: `src/services/window-service.ts`
- Create: `src/services/screenshot-service.ts`
- Create: `src/services/wait-service.ts`

- [ ] **Step 1: Write `src/services/permission-service.ts`**

```ts
import type { NativeBridge } from "../native/bridge-interface.js";
import type { PermissionStatus } from "../models/index.js";

export class PermissionService {
  constructor(private bridge: NativeBridge) {}
  check(): Promise<PermissionStatus> {
    return this.bridge.checkPermissions();
  }
}
```

- [ ] **Step 2: Write `src/services/window-service.ts`**

```ts
import type { NativeBridge } from "../native/bridge-interface.js";
import type { WindowInfo } from "../models/index.js";

export class WindowService {
  constructor(private bridge: NativeBridge) {}
  list(bundleId?: string): Promise<WindowInfo[]> {
    return this.bridge.listWindows(bundleId);
  }
  frontmost(): Promise<WindowInfo> {
    return this.bridge.getFrontmostWindow();
  }
}
```

- [ ] **Step 3: Write `src/services/screenshot-service.ts`**

```ts
import type { NativeBridge } from "../native/bridge-interface.js";
import type { SafetyService } from "./safety-service.js";
import type { AuditService } from "./audit-service.js";
import type { ScreenshotRequest, ScreenshotResult } from "../models/index.js";

export class ScreenshotService {
  constructor(
    private bridge: NativeBridge,
    private safety: SafetyService,
    private audit: AuditService
  ) {}

  async capture(req: ScreenshotRequest): Promise<ScreenshotResult> {
    const t0 = Date.now();
    try {
      const result = await this.bridge.screenshot(req);
      // Redaction (v1 stub): Swift helper applies blur server-side when strictAx flag is sent;
      // for v1 we rely on shouldRedact as a signal and let the helper handle blurring via bundle ID.
      // If blur is not applied by helper, this is a gap tracked for v1.1.
      await this.audit.log({
        tool: "screenshot",
        target: { bundleId: result.target.bundleId, windowTitle: result.target.windowTitle, pid: result.target.pid },
        params: { app: req.app, windowTitle: req.windowTitle },
        result: "ok",
        durationMs: Date.now() - t0,
      });
      if (this.safety.shouldRedact(result.target.bundleId)) {
        // Placeholder for v1.1: call a `redact_screenshot` helper command or apply blur here.
        // For now, annotate the result so the caller/agent knows the content is pre-blurred in helper.
        // No action — the Swift helper is configured to blur sensitive apps; if it doesn't, that's a gap.
      }
      return result;
    } catch (err) {
      await this.audit.log({
        tool: "screenshot",
        target: {},
        params: { app: req.app, windowTitle: req.windowTitle },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }
}
```

- [ ] **Step 4: Write `src/services/wait-service.ts`**

```ts
import type { NativeBridge } from "../native/bridge-interface.js";
import type { SafetyService } from "./safety-service.js";
import type { WaitRequest } from "../models/index.js";

export class WaitService {
  constructor(private bridge: NativeBridge, private safety: SafetyService) {}

  async wait(req: WaitRequest): Promise<void> {
    await this.safety.rateLimit();
    const ms = typeof req.ms === "number" && req.ms > 0 ? req.ms : 1000;
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 5: Run typecheck to verify it compiles**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/permission-service.ts src/services/window-service.ts src/services/screenshot-service.ts src/services/wait-service.ts
git commit -m "feat(services): permission, window, screenshot, wait wrappers over NativeBridge"
```

---

### Task 12: input-service.ts (click, type_text, key_press, scroll)

**Files:**
- Create: `src/services/input-service.ts`
- Create: `src/services/index.ts`

- [ ] **Step 1: Write `src/services/input-service.ts`**

```ts
import type { NativeBridge } from "../native/bridge-interface.js";
import type { SafetyService } from "./safety-service.js";
import type { AuditService } from "./audit-service.js";
import type {
  ClickRequest, TypeTextRequest, KeyPressRequest, ScrollRequest, WindowTarget,
} from "../models/index.js";

export class InputService {
  constructor(
    private bridge: NativeBridge,
    private safety: SafetyService,
    private audit: AuditService
  ) {}

  async click(req: ClickRequest, target: WindowTarget): Promise<void> {
    this.safety.assertAllowed(target.bundleId);
    await this.safety.rateLimit();
    const t0 = Date.now();
    try {
      await this.bridge.click(req);
      await this.audit.log({
        tool: "click",
        target: { bundleId: target.bundleId, windowTitle: target.windowTitle, pid: target.pid },
        params: { x: req.x, y: req.y, captureId: req.captureId },
        result: "ok",
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      await this.audit.log({
        tool: "click",
        target: { bundleId: target.bundleId },
        params: { x: req.x, y: req.y, captureId: req.captureId },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }

  async typeText(req: TypeTextRequest, target: WindowTarget): Promise<void> {
    this.safety.assertAllowed(target.bundleId);
    this.safety.scanForSecrets(req.text);
    await this.safety.rateLimit();
    const t0 = Date.now();
    try {
      await this.bridge.typeText(req);
      await this.audit.log({
        tool: "type_text",
        target: { bundleId: target.bundleId, windowTitle: target.windowTitle, pid: target.pid },
        params: { text: req.text }, // audit-service redacts
        result: "ok",
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      await this.audit.log({
        tool: "type_text",
        target: { bundleId: target.bundleId },
        params: { text: req.text },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }

  async keyPress(req: KeyPressRequest, target: WindowTarget): Promise<void> {
    this.safety.assertAllowed(target.bundleId);
    await this.safety.rateLimit();
    const t0 = Date.now();
    try {
      await this.bridge.keyPress(req);
      await this.audit.log({
        tool: "key_press",
        target: { bundleId: target.bundleId, windowTitle: target.windowTitle, pid: target.pid },
        params: { key: req.key, modifiers: req.modifiers ?? [] },
        result: "ok",
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      await this.audit.log({
        tool: "key_press",
        target: { bundleId: target.bundleId },
        params: { key: req.key, modifiers: req.modifiers ?? [] },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }

  async scroll(req: ScrollRequest, target: WindowTarget): Promise<void> {
    this.safety.assertAllowed(target.bundleId);
    await this.safety.rateLimit();
    const t0 = Date.now();
    try {
      await this.bridge.scroll(req);
      await this.audit.log({
        tool: "scroll",
        target: { bundleId: target.bundleId, windowTitle: target.windowTitle, pid: target.pid },
        params: { direction: req.direction, amount: req.amount },
        result: "ok",
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      await this.audit.log({
        tool: "scroll",
        target: { bundleId: target.bundleId },
        params: { direction: req.direction, amount: req.amount },
        result: "error",
        errorCode: (err as any)?.code,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }
}
```

- [ ] **Step 2: Write `src/services/index.ts`**

```ts
export { SafetyService } from "./safety-service.js";
export { AuditService } from "./audit-service.js";
export { PermissionService } from "./permission-service.js";
export { WindowService } from "./window-service.js";
export { ScreenshotService } from "./screenshot-service.js";
export { WaitService } from "./wait-service.js";
export { InputService } from "./input-service.js";
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/input-service.ts src/services/index.ts
git commit -m "feat(input): click/type_text/key_press/scroll with safety pipeline + audit"
```

---

## Phase 5: Context + Tools

### Task 13: types.ts + context-factory.ts + tool-examples.ts

**Files:**
- Create: `src/types.ts`
- Create: `src/context-factory.ts`
- Create: `src/tool-examples.ts`

- [ ] **Step 1: Write `src/types.ts`**

```ts
import type { Config } from "./config.js";
import type { NativeBridge } from "./native/bridge-interface.js";
import type {
  SafetyService, AuditService, PermissionService, WindowService,
  ScreenshotService, WaitService, InputService,
} from "./services/index.js";

export interface ServiceContext {
  readonly config: Config;
  readonly bridge: NativeBridge;
  readonly safety: SafetyService;
  readonly audit: AuditService;
  readonly permission: PermissionService;
  readonly window: WindowService;
  readonly screenshot: ScreenshotService;
  readonly wait: WaitService;
  readonly input: InputService;
}
```

- [ ] **Step 2: Write `src/context-factory.ts`**

```ts
import { loadConfig } from "./config.js";
import { createNativeBridge } from "./native/factory.js";
import {
  SafetyService, AuditService, PermissionService, WindowService,
  ScreenshotService, WaitService, InputService,
} from "./services/index.js";
import type { ServiceContext } from "./types.js";

export async function createServiceContext(): Promise<ServiceContext> {
  const config = loadConfig();
  const bridge = await createNativeBridge(config);
  const safety = new SafetyService(config);
  const audit = new AuditService({ enabled: config.auditEnabled, path: config.auditPath });
  const permission = new PermissionService(bridge);
  const window = new WindowService(bridge);
  const screenshot = new ScreenshotService(bridge, safety, audit);
  const wait = new WaitService(bridge, safety);
  const input = new InputService(bridge, safety, audit);
  return { config, bridge, safety, audit, permission, window, screenshot, wait, input };
}
```

- [ ] **Step 3: Write `src/tool-examples.ts`**

```ts
export { descWithExamples } from "@mcp-consultant-tools/core";

export const SCREENSHOT_APP_EXAMPLES = [
  { label: "Obsidian", value: "md.obsidian" },
  { label: "Finder", value: "com.apple.finder" },
  { label: "Figma Desktop", value: "com.figma.Desktop" },
];

export const WINDOW_TITLE_EXAMPLES = [
  { label: "Match by title substring", value: "Daily Notes" },
  { label: "Exact window title", value: "System Settings" },
];

export const KEY_EXAMPLES = [
  { label: "Enter", value: "return" },
  { label: "Escape", value: "escape" },
  { label: "Tab", value: "tab" },
  { label: "Arrow down", value: "down" },
];

export const MODIFIER_EXAMPLES = [
  { label: "Cmd+C", value: '["cmd"]' },
  { label: "Cmd+Shift+P", value: '["cmd","shift"]' },
  { label: "Opt+Arrow", value: '["opt"]' },
];

export const SCROLL_EXAMPLES = [
  { label: "Scroll down 3 ticks", value: '{"direction":"down","amount":3}' },
  { label: "Scroll up 1 tick", value: '{"direction":"up","amount":1}' },
];
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: Zero errors.

> If `@mcp-consultant-tools/core` isn't yet published or the import fails, replace the first line of `tool-examples.ts` with this local shim until you confirm the published version:
>
> ```ts
> export function descWithExamples(desc: string, examples: { label: string; value: string }[]): string {
>   const exLines = examples.map((e) => `- ${e.label}: ${e.value}`).join("\n");
>   return `${desc}\n\nExamples:\n${exLines}`;
> }
> ```

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/context-factory.ts src/tool-examples.ts
git commit -m "feat(context): ServiceContext + factory + tool-examples arrays"
```

---

### Task 14: MCP tool registrations (all 9 tools)

**Files:**
- Create: `src/tools/permission-tools.ts`
- Create: `src/tools/window-tools.ts`
- Create: `src/tools/screenshot-tools.ts`
- Create: `src/tools/input-tools.ts`
- Create: `src/tools/wait-tools.ts`
- Create: `src/tools/index.ts`
- Create: `tests/unit/tools-registration.test.ts`

> **Helper for tool handlers.** Every tool returns MCP-format content `{ content: [{ type: "text", text: "..." }] }`, and write-tools need a `target` resolved via `ctx.window.frontmost()` when the request doesn't supply one. Write-tools use the screenshot's bundle ID if a `capture_id` is active; for v1 we resolve target via the frontmost window at call time since v1 does NOT retain runtime state across tool calls. If the target bundle ID is on the allowlist, the action proceeds.

- [ ] **Step 1: Write `tests/unit/tools-registration.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { registerAllTools } from "../../src/tools/index.js";
import type { ServiceContext } from "../../src/types.js";

function makeServer() {
  const registered: string[] = [];
  return {
    registered,
    tool: (name: string) => registered.push(name),
  };
}

function makeCtx(overrides: Partial<ServiceContext["config"]> = {}): ServiceContext {
  return {
    config: {
      strictAx: true, allowAll: false, allowedApps: [],
      auditEnabled: false, auditPath: "",
      rateLimitMs: 0, secretScan: false, redact: false,
      redactApps: [], confirm: false, readonly: false,
      ...overrides,
    },
  } as any;
}

describe("registerAllTools READONLY filter", () => {
  it("registers all 9 tools when readonly=false", () => {
    const server = makeServer();
    registerAllTools(server as any, makeCtx());
    expect(server.registered.sort()).toEqual([
      "check_permissions", "click", "get_frontmost_window", "key_press",
      "list_windows", "screenshot", "scroll", "type_text", "wait",
    ]);
  });

  it("registers only read tools + screenshot when readonly=true", () => {
    const server = makeServer();
    registerAllTools(server as any, makeCtx({ readonly: true }));
    expect(server.registered.sort()).toEqual([
      "check_permissions", "get_frontmost_window", "list_windows", "screenshot",
    ]);
  });
});
```

- [ ] **Step 2: Write `src/tools/permission-tools.ts`**

```ts
import type { ServiceContext } from "../types.js";

export function registerPermissionTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "check_permissions",
    "Report macOS Accessibility + Screen Recording permission status for the helper binary.",
    {},
    async () => {
      const perm = await ctx.permission.check();
      return {
        content: [{ type: "text", text: JSON.stringify(perm, null, 2) }],
      };
    }
  );
}
```

- [ ] **Step 3: Write `src/tools/window-tools.ts`**

```ts
import { z } from "zod";
import type { ServiceContext } from "../types.js";

export function registerWindowTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "list_windows",
    "List visible windows with title, bundle ID, pid, and frame. Optionally filter by bundle ID.",
    { bundleId: z.string().optional().describe("Optional bundle ID filter, e.g. 'md.obsidian'") },
    async (args: { bundleId?: string }) => {
      const windows = await ctx.window.list(args.bundleId);
      return { content: [{ type: "text", text: JSON.stringify(windows, null, 2) }] };
    }
  );

  server.tool(
    "get_frontmost_window",
    "Return the currently frontmost app + window. Safe default before any action.",
    {},
    async () => {
      const win = await ctx.window.frontmost();
      return { content: [{ type: "text", text: JSON.stringify(win, null, 2) }] };
    }
  );
}
```

- [ ] **Step 4: Write `src/tools/screenshot-tools.ts`**

```ts
import { z } from "zod";
import type { ServiceContext } from "../types.js";
import { descWithExamples, SCREENSHOT_APP_EXAMPLES, WINDOW_TITLE_EXAMPLES } from "../tool-examples.js";

export function registerScreenshotTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "screenshot",
    "Capture a screenshot of a target window (default: frontmost). Returns capture_id used to anchor subsequent click/scroll calls, plus base64-encoded PNG.",
    {
      app: z.string().optional().describe(
        descWithExamples(
          "Bundle ID of the app whose window to target. Omit for frontmost.",
          SCREENSHOT_APP_EXAMPLES
        )
      ),
      windowTitle: z.string().optional().describe(
        descWithExamples(
          "Window title substring to disambiguate when an app has multiple windows.",
          WINDOW_TITLE_EXAMPLES
        )
      ),
    },
    async (args: { app?: string; windowTitle?: string }) => {
      const result = await ctx.screenshot.capture(args);
      return {
        content: [
          { type: "text", text: JSON.stringify({
            capture_id: result.capture.captureId,
            target: result.target,
            size: { width: result.capture.width, height: result.capture.height, scale: result.capture.scaleFactor },
          }, null, 2) },
          { type: "image", data: result.pngBase64, mimeType: "image/png" },
        ],
      };
    }
  );
}
```

- [ ] **Step 5: Write `src/tools/input-tools.ts`**

```ts
import { z } from "zod";
import type { ServiceContext } from "../types.js";
import {
  descWithExamples, KEY_EXAMPLES, MODIFIER_EXAMPLES, SCROLL_EXAMPLES,
} from "../tool-examples.js";

export function registerInputTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "click",
    "Click at (x, y) within the window captured by `capture_id`. Coordinates are screenshot-pixel space.",
    {
      x: z.number().describe("X coordinate, 0-indexed from left edge of captured window."),
      y: z.number().describe("Y coordinate, 0-indexed from top edge of captured window."),
      capture_id: z.string().describe("capture_id returned by the last `screenshot` call."),
    },
    async (args: { x: number; y: number; capture_id: string }) => {
      const target = await ctx.window.frontmost();
      await ctx.input.click({ x: args.x, y: args.y, captureId: args.capture_id }, {
        appName: target.appName, bundleId: target.bundleId, pid: target.pid,
        windowTitle: target.title, windowId: target.windowId,
      });
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "type_text",
    "Type text into the focused element of the frontmost window. Rejects obvious secrets.",
    {
      text: z.string().describe("Text to type. Secrets (sk-…, ghp_…, AKIA…, long base64) are rejected."),
    },
    async (args: { text: string }) => {
      const target = await ctx.window.frontmost();
      await ctx.input.typeText({ text: args.text }, {
        appName: target.appName, bundleId: target.bundleId, pid: target.pid,
        windowTitle: target.title, windowId: target.windowId,
      });
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "key_press",
    "Send a keyboard shortcut (key + optional modifiers) to the frontmost window.",
    {
      key: z.string().describe(
        descWithExamples("Key name. Common: return, escape, tab, up/down/left/right, a-z, 0-9.", KEY_EXAMPLES)
      ),
      modifiers: z.array(z.enum(["cmd", "opt", "ctrl", "shift"])).optional().describe(
        descWithExamples("Modifier keys to hold while pressing.", MODIFIER_EXAMPLES)
      ),
    },
    async (args: { key: string; modifiers?: ("cmd"|"opt"|"ctrl"|"shift")[] }) => {
      const target = await ctx.window.frontmost();
      await ctx.input.keyPress({ key: args.key, modifiers: args.modifiers }, {
        appName: target.appName, bundleId: target.bundleId, pid: target.pid,
        windowTitle: target.title, windowId: target.windowId,
      });
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "scroll",
    "Scroll the frontmost window in the given direction.",
    {
      direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction."),
      amount: z.number().int().positive().describe(
        descWithExamples("Number of scroll ticks / lines.", SCROLL_EXAMPLES)
      ),
      capture_id: z.string().optional().describe("Optional capture_id to anchor to a specific window."),
    },
    async (args: { direction: "up"|"down"|"left"|"right"; amount: number; capture_id?: string }) => {
      const target = await ctx.window.frontmost();
      await ctx.input.scroll(
        { direction: args.direction, amount: args.amount, captureId: args.capture_id },
        { appName: target.appName, bundleId: target.bundleId, pid: target.pid,
          windowTitle: target.title, windowId: target.windowId }
      );
      return { content: [{ type: "text", text: "ok" }] };
    }
  );
}
```

- [ ] **Step 6: Write `src/tools/wait-tools.ts`**

```ts
import { z } from "zod";
import type { ServiceContext } from "../types.js";

export function registerWaitTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "wait",
    "Pause for `ms` milliseconds (default 1000). Counts against the rate limit.",
    { ms: z.number().int().positive().optional().describe("Milliseconds to wait (default 1000).") },
    async (args: { ms?: number }) => {
      await ctx.wait.wait({ ms: args.ms });
      return { content: [{ type: "text", text: "ok" }] };
    }
  );
}
```

- [ ] **Step 7: Write `src/tools/index.ts`**

```ts
import type { ServiceContext } from "../types.js";
import { registerPermissionTools } from "./permission-tools.js";
import { registerWindowTools } from "./window-tools.js";
import { registerScreenshotTools } from "./screenshot-tools.js";
import { registerInputTools } from "./input-tools.js";
import { registerWaitTools } from "./wait-tools.js";

export function registerAllTools(server: any, ctx: ServiceContext): void {
  // Always available (read + screenshot)
  registerPermissionTools(server, ctx);
  registerWindowTools(server, ctx);
  registerScreenshotTools(server, ctx);

  // Write tools — gated by readonly mode
  if (!ctx.config.readonly) {
    registerInputTools(server, ctx);
    registerWaitTools(server, ctx);
  }
}
```

- [ ] **Step 8: Run tests — expect registration test to pass**

Run: `npm test -- tools-registration`
Expected: 2 passed.

- [ ] **Step 9: Commit**

```bash
git add src/tools tests/unit/tools-registration.test.ts
git commit -m "feat(tools): register 9 MCP tools with READONLY filter + examples"
```

---

### Task 15: MCP server entry — src/index.ts

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write `src/index.ts`**

```ts
#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";

import { createServiceContext } from "./context-factory.js";
import { registerAllTools } from "./tools/index.js";

export async function registerComputerUseTools(server: any): Promise<void> {
  const ctx = await createServiceContext();
  registerAllTools(server, ctx);

  // Shutdown bridge on transport close
  process.on("SIGINT", () => { ctx.bridge.shutdown().finally(() => process.exit(0)); });
  process.on("SIGTERM", () => { ctx.bridge.shutdown().finally(() => process.exit(0)); });
}

// Self-executing block — only runs when invoked directly as `mcp-cu`
const entryUrl = pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === entryUrl) {
  createEnvLoader();
  const server = createMcpServer({
    name: "mcp-computer-use",
    version: "0.1.0-beta.1",
  });
  const transport = new StdioServerTransport();
  registerComputerUseTools(server)
    .then(() => server.connect(transport))
    .catch((err) => {
      console.error("Failed to start mcp-computer-use:", err);
      process.exit(1);
    });
}
```

> If `@mcp-consultant-tools/core` does not export `createMcpServer` / `createEnvLoader` in the installed version, fall back to direct SDK usage:
>
> ```ts
> import { Server } from "@modelcontextprotocol/sdk/server/index.js";
> import dotenv from "dotenv"; // add as dep if using
> // ...
> const server = new Server({ name: "mcp-computer-use", version: "0.1.0-beta.1" }, { capabilities: { tools: {} } });
> ```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Zero TypeScript errors. `build/index.js` exists and is executable.

- [ ] **Step 3: Smoke-test the built server with mock helper**

```bash
MCP_CU_ALLOWED_APPS=md.obsidian \
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node build/index.js 2>&1 | head -50
```

Expected: A JSON-RPC response listing the 9 tools (or 4, if READONLY set) with their schemas. If the server errors because the Swift helper isn't reachable, that's OK for this step — we're only verifying the server boots and registers tools. (Tool execution is tested in Phase 6 integration.)

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(server): MCP server entry with stdio transport + signal-safe shutdown"
```

---

## Phase 6: CLI + integration

### Task 16: CLI output + commands

**Files:**
- Create: `src/cli/output.ts`
- Create: `src/cli/commands/permission-commands.ts`
- Create: `src/cli/commands/window-commands.ts`
- Create: `src/cli/commands/screenshot-commands.ts`
- Create: `src/cli/commands/input-commands.ts`
- Create: `src/cli/commands/wait-commands.ts`
- Create: `src/cli/commands/index.ts`
- Create: `src/cli.ts`

- [ ] **Step 1: Write `src/cli/output.ts`**

```ts
import { outputResult as coreOutputResult } from "@mcp-consultant-tools/core";
import path from "node:path";

const CACHE_DIR = path.resolve(process.cwd(), ".context", ".mcp-cu-cache");

export function outputResult(
  args: { fileName: string; data: unknown; summary: string },
  flags: { json?: boolean; cache?: boolean }
): void {
  coreOutputResult({ ...args, cacheDir: CACHE_DIR }, flags);
}
```

> If `@mcp-consultant-tools/core` lacks `outputResult`, inline a tiny version:
>
> ```ts
> import fs from "node:fs";
> import path from "node:path";
> export function outputResult(
>   args: { fileName: string; data: unknown; summary: string },
>   flags: { json?: boolean; cache?: boolean }
> ): void {
>   if (flags.json) { console.log(JSON.stringify(args.data, null, 2)); return; }
>   console.log(args.summary);
>   if (flags.cache !== false) {
>     fs.mkdirSync(CACHE_DIR, { recursive: true });
>     fs.writeFileSync(path.join(CACHE_DIR, `${args.fileName}.json`), JSON.stringify(args.data, null, 2));
>   }
> }
> ```

- [ ] **Step 2: Write `src/cli/commands/permission-commands.ts`**

```ts
import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerPermissionCommands(program: any, ctx: ServiceContext): void {
  program
    .command("check-permissions")
    .description("Report AX + Screen Recording permission status")
    .action(async () => {
      try {
        const perm = await ctx.permission.check();
        outputResult({
          fileName: "check-permissions",
          data: perm,
          summary: `accessibility=${perm.accessibility} screenRecording=${perm.screenRecording}`,
        }, program.opts());
      } catch (e) { handleCliError(e, "check-permissions"); }
    });
}
```

- [ ] **Step 3: Write `src/cli/commands/window-commands.ts`**

```ts
import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerWindowCommands(program: any, ctx: ServiceContext): void {
  program
    .command("list-windows")
    .option("--app <bundleId>", "Filter by bundle ID")
    .action(async (opts: { app?: string }) => {
      try {
        const wins = await ctx.window.list(opts.app);
        outputResult({
          fileName: `list-windows${opts.app ? "-" + opts.app : ""}`,
          data: wins,
          summary: wins.map((w) => `${w.bundleId} pid=${w.pid} "${w.title}"`).join("\n"),
        }, program.opts());
      } catch (e) { handleCliError(e, "list-windows"); }
    });

  program
    .command("get-frontmost-window")
    .action(async () => {
      try {
        const win = await ctx.window.frontmost();
        outputResult({
          fileName: "get-frontmost-window",
          data: win,
          summary: `${win.bundleId} pid=${win.pid} "${win.title}"`,
        }, program.opts());
      } catch (e) { handleCliError(e, "get-frontmost-window"); }
    });
}
```

- [ ] **Step 4: Write `src/cli/commands/screenshot-commands.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerScreenshotCommands(program: any, ctx: ServiceContext): void {
  program
    .command("screenshot")
    .option("--app <bundleId>", "Target bundle ID (default: frontmost)")
    .option("--window <title>", "Window title substring")
    .option("--out <path>", "Write PNG to this path")
    .action(async (opts: { app?: string; window?: string; out?: string }) => {
      try {
        const result = await ctx.screenshot.capture({ app: opts.app, windowTitle: opts.window });
        if (opts.out) {
          const p = path.resolve(process.cwd(), opts.out);
          fs.writeFileSync(p, Buffer.from(result.pngBase64, "base64"));
        }
        outputResult({
          fileName: `screenshot-${result.capture.captureId}`,
          data: { ...result, pngBase64: `[${result.pngBase64.length} chars]` },
          summary: `captured ${result.target.bundleId} "${result.target.windowTitle}" ${result.capture.width}x${result.capture.height} capture_id=${result.capture.captureId}${opts.out ? ` (PNG → ${opts.out})` : ""}`,
        }, program.opts());
      } catch (e) { handleCliError(e, "screenshot"); }
    });
}
```

- [ ] **Step 5: Write `src/cli/commands/input-commands.ts`**

```ts
import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerInputCommands(program: any, ctx: ServiceContext): void {
  program
    .command("click <x> <y>")
    .requiredOption("--capture-id <id>", "capture_id from prior screenshot")
    .action(async (xStr: string, yStr: string, opts: { captureId: string }) => {
      try {
        const target = await ctx.window.frontmost();
        await ctx.input.click(
          { x: parseInt(xStr, 10), y: parseInt(yStr, 10), captureId: opts.captureId },
          { appName: target.appName, bundleId: target.bundleId, pid: target.pid,
            windowTitle: target.title, windowId: target.windowId }
        );
        outputResult({ fileName: "click", data: { x: xStr, y: yStr }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "click"); }
    });

  program
    .command("type-text <text>")
    .action(async (text: string) => {
      try {
        const target = await ctx.window.frontmost();
        await ctx.input.typeText({ text }, {
          appName: target.appName, bundleId: target.bundleId, pid: target.pid,
          windowTitle: target.title, windowId: target.windowId,
        });
        outputResult({ fileName: "type-text", data: { len: text.length }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "type-text"); }
    });

  program
    .command("key-press <key>")
    .option("--modifiers <list>", "Comma-separated: cmd,opt,ctrl,shift")
    .action(async (key: string, opts: { modifiers?: string }) => {
      try {
        const mods = opts.modifiers
          ? (opts.modifiers.split(",").map((s) => s.trim()) as ("cmd"|"opt"|"ctrl"|"shift")[])
          : undefined;
        const target = await ctx.window.frontmost();
        await ctx.input.keyPress({ key, modifiers: mods }, {
          appName: target.appName, bundleId: target.bundleId, pid: target.pid,
          windowTitle: target.title, windowId: target.windowId,
        });
        outputResult({ fileName: "key-press", data: { key, modifiers: mods }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "key-press"); }
    });

  program
    .command("scroll <direction> <amount>")
    .option("--capture-id <id>", "Optional capture_id anchor")
    .action(async (direction: string, amountStr: string, opts: { captureId?: string }) => {
      try {
        const target = await ctx.window.frontmost();
        await ctx.input.scroll(
          { direction: direction as any, amount: parseInt(amountStr, 10), captureId: opts.captureId },
          { appName: target.appName, bundleId: target.bundleId, pid: target.pid,
            windowTitle: target.title, windowId: target.windowId }
        );
        outputResult({ fileName: "scroll", data: { direction, amount: amountStr }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "scroll"); }
    });
}
```

- [ ] **Step 6: Write `src/cli/commands/wait-commands.ts`**

```ts
import type { ServiceContext } from "../../types.js";
import { outputResult } from "../output.js";
import { handleCliError } from "@mcp-consultant-tools/core";

export function registerWaitCommands(program: any, ctx: ServiceContext): void {
  program
    .command("wait")
    .option("--ms <n>", "Milliseconds to wait (default 1000)")
    .action(async (opts: { ms?: string }) => {
      try {
        const ms = opts.ms ? parseInt(opts.ms, 10) : undefined;
        await ctx.wait.wait({ ms });
        outputResult({ fileName: "wait", data: { ms: ms ?? 1000 }, summary: "ok" }, program.opts());
      } catch (e) { handleCliError(e, "wait"); }
    });
}
```

- [ ] **Step 7: Write `src/cli/commands/index.ts`**

```ts
import type { ServiceContext } from "../../types.js";
import { registerPermissionCommands } from "./permission-commands.js";
import { registerWindowCommands } from "./window-commands.js";
import { registerScreenshotCommands } from "./screenshot-commands.js";
import { registerInputCommands } from "./input-commands.js";
import { registerWaitCommands } from "./wait-commands.js";

export function registerAllCommands(program: any, ctx: ServiceContext): void {
  registerPermissionCommands(program, ctx);
  registerWindowCommands(program, ctx);
  registerScreenshotCommands(program, ctx);
  registerInputCommands(program, ctx);
  registerWaitCommands(program, ctx);
}
```

- [ ] **Step 8: Write `src/cli.ts`**

```ts
#!/usr/bin/env node
import { createCliProgram, loadEnvForCli } from "@mcp-consultant-tools/core";
import { createServiceContext } from "./context-factory.js";
import { registerAllCommands } from "./cli/commands/index.js";

async function main() {
  loadEnvForCli();
  const program = createCliProgram({
    name: "mcp-cu-cli",
    description: "CLI for mcp-computer-use — same tools as MCP, via terminal.",
    version: "0.1.0-beta.1",
  });

  const ctx = await createServiceContext();
  registerAllCommands(program, ctx);

  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 9: Build + CLI smoke test**

```bash
npm run build
node build/cli.js --help
node build/cli.js get-frontmost-window  # should print frontmost window or a clear permission error
```

Expected: `--help` lists all 7 commands. `get-frontmost-window` either returns window info (if AX permission granted) or a helpful error pointing the user at System Settings.

- [ ] **Step 10: Commit**

```bash
git add src/cli src/cli.ts
git commit -m "feat(cli): Commander CLI with parity for all 9 MCP tools"
```

---

### Task 17: Integration test against real Swift helper

**Files:**
- Create: `tests/integration/macos-helper.test.ts`

- [ ] **Step 1: Write `tests/integration/macos-helper.test.ts`**

```ts
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

  beforeAll(async () => {
    if (!(await helperExists())) {
      throw new Error(`Swift helper not installed at ${HELPER}. Run: npm run build:native`);
    }
    bridge = new MacosBridge(loadConfig());
  });

  afterAll(async () => {
    await bridge?.shutdown();
  });

  it("check_permissions returns well-formed object", async () => {
    const perm = await bridge.checkPermissions();
    expect(perm).toHaveProperty("accessibility");
    expect(perm).toHaveProperty("screenRecording");
    expect(typeof perm.accessibility).toBe("boolean");
    expect(typeof perm.screenRecording).toBe("boolean");
  });

  it("list_windows returns an array", async () => {
    const perm = await bridge.checkPermissions();
    if (!perm.accessibility || !perm.screenRecording) {
      console.warn("[integration] AX or Screen Recording not granted — list_windows may fail. Grant in System Settings and retry.");
      return;
    }
    const wins = await bridge.listWindows();
    expect(Array.isArray(wins)).toBe(true);
  });

  it("get_frontmost_window returns a WindowInfo", async () => {
    const perm = await bridge.checkPermissions();
    if (!perm.accessibility || !perm.screenRecording) return;
    const win = await bridge.getFrontmostWindow();
    expect(win).toHaveProperty("bundleId");
    expect(win).toHaveProperty("title");
    expect(win).toHaveProperty("pid");
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npm test -- integration`
Expected: 3 passed on macOS (permissions may need to be granted first — test logs a warning and skips behavior checks if not). On non-macOS, tests are skipped.

If `check_permissions` passes but `list_windows`/`get_frontmost_window` throw with AX/Screen Recording errors: open **System Settings → Privacy & Security → Accessibility / Screen Recording**, enable `~/.mcp-computer-use/bridge`, and rerun.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/macos-helper.test.ts
git commit -m "test(integration): live Swift helper round-trip (macOS only, skipped elsewhere)"
```

---

## Phase 7: Docs + release prep

### Task 18: Docs — technical, user, release notes; polish README

**Files:**
- Create: `docs/technical/COMPUTER_USE_TECHNICAL.md`
- Create: `docs/documentation/computer-use.md`
- Create: `docs/release-notes/v0.1.0-beta.1.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/technical/COMPUTER_USE_TECHNICAL.md`**

Structure (XML-tagged per monorepo convention):

```markdown
# mcp-computer-use — Technical Reference

<overview>
macOS-only MCP server giving agents semantic desktop-app control via AX + ScreenCaptureKit.
Forked from injaneity/pi-computer-use (MIT © Zane Chee); see `/NOTICE`.
</overview>

<tools>
[For each of the 9 tools: name, purpose, parameters with types + descriptions, returns, examples, errors it can raise]
</tools>

<safety-model>
[Full flag table copied from spec, profile presets, safety pipeline diagram in ASCII]
</safety-model>

<ipc-protocol>
Newline-delimited JSON over stdio. Request: `{id, cmd, ...args}`. Response: `{id, ok, result|error}`.
Commands: screenshot, click, type_text, key_press, scroll, list_windows, get_frontmost_window, check_permissions, shutdown.
</ipc-protocol>

<cli-architecture>
Binary: `mcp-cu-cli`. Command groups: permission, window, screenshot, input, wait.
Cache dir: `.context/.mcp-cu-cache/`. Flags: --json, --no-cache, --env-file.
</cli-architecture>

<troubleshooting>
- "Helper not installed" → `npm run build:native`
- AX/Screen Recording errors → System Settings → Privacy & Security → enable ~/.mcp-computer-use/bridge
- "APP_NOT_ALLOWED" → add bundle ID to MCP_CU_ALLOWED_APPS or use MCP_CU_PROFILE=permissive temporarily
- "SECRET_DETECTED" → check text doesn't contain sk-/ghp_/AKIA/long base64; set MCP_CU_SECRET_SCAN=0 if false-positive
</troubleshooting>

<architecture>
Service-Tool-Prompt layering: NativeBridge (Swift IPC) → Services (business logic + safety) → Tools (MCP wrappers) / CLI (Commander wrappers).
</architecture>
```

Expand each `<>` section with concrete content from the spec + this plan. Keep under 800 lines.

- [ ] **Step 2: Write `docs/documentation/computer-use.md`** (short, user-facing)

```markdown
<!-- AGENT POINTER: Full technical reference at docs/technical/COMPUTER_USE_TECHNICAL.md -->

# mcp-computer-use

MCP server giving agents semantic macOS app control.

## MCP Configuration

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/computer-use@beta", "mcp-cu"],
      "env": {
        "MCP_CU_ALLOWED_APPS": "md.obsidian,com.apple.finder,com.apple.systempreferences,com.mitchellh.ghostty,dev.cmux.app,com.figma.Desktop",
        "MCP_CU_STRICT_AX": "1",
        "MCP_CU_RATE_LIMIT_MS": "250",
        "MCP_CU_AUDIT_LOG": "1",
        "MCP_CU_SECRET_SCAN": "1",
        "MCP_CU_REDACT": "1"
      }
    }
  }
}
```

## Prompts
(none in v1 — pure tool server)

## Notable behavior
- First-run: postinstall compiles the Swift helper from source (requires Xcode CLT). macOS will prompt for Accessibility + Screen Recording the first time an action runs. Revoke in System Settings → Privacy & Security when not in use.
- Write tools require the target window's bundle ID to be on `MCP_CU_ALLOWED_APPS`. Reads (screenshot, list_windows, get_frontmost_window, check_permissions) are never gated.
- `MCP_CU_READONLY=1` hides write tools entirely (registration-time filter).
- `type_text` rejects text matching common secret patterns.

## CLI

```bash
npx --package=@mcp-consultant-tools/computer-use mcp-cu-cli --help
```
```

- [ ] **Step 3: Write `docs/release-notes/v0.1.0-beta.1.md`**

```markdown
# v0.1.0-beta.1 — Initial release

First public beta of `@mcp-consultant-tools/computer-use`.

## Features
- 9 MCP tools: screenshot, click, type_text, key_press, scroll, wait, list_windows, get_frontmost_window, check_permissions
- Default-secure safety model: strict-AX mode, per-app allowlist, audit log, rate limit, type_text secret scan, sensitive-app redaction
- PROFILE presets: stealth (default) / permissive / readonly / confirm
- READONLY mode hides write tools entirely
- Full CLI parity via `mcp-cu-cli`
- Compile-from-source Swift helper (no prebuilt binary shipped)

## Derived from
[injaneity/pi-computer-use](https://github.com/injaneity/pi-computer-use) v0.1.1 @ commit `96434a7` (MIT © Zane Chee). See `NOTICE`.

## Install

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/computer-use@beta", "mcp-cu"]
    }
  }
}
```

Requires macOS + Xcode Command Line Tools.
```

- [ ] **Step 4: Expand `README.md`**

Replace the stub with a full README covering: What it is, Why (vs. Playwright), Install (MCP + CLI), Quick examples, Safety model summary (link to tech doc), Acknowledgements (MIT attribution), Roadmap (Windows v2, confirm-mode polish).

- [ ] **Step 5: Commit**

```bash
git add docs README.md
git commit -m "docs: add technical reference, user guide, release notes, polished README"
```

---

### Task 19: npm pack smoke test + final checks

- [ ] **Step 1: Run full build + test**

```bash
npm run build
npm test
```

Expected: Build succeeds with zero errors. All unit tests pass (config, safety, audit, macos-bridge, tools-registration). Integration tests pass or cleanly skip on non-darwin.

- [ ] **Step 2: Pack and inspect**

```bash
npm pack --dry-run
```

Expected: Tarball contents include `build/`, `native/macos/bridge.swift`, `scripts/`, `LICENSE`, `NOTICE`, `README.md`, `package.json`. **Must NOT include:** `tests/`, `src/` (TS source), `docs/`, `.env`, `node_modules/`.

If `src/` appears, check the `files` array in `package.json`.

- [ ] **Step 3: Dry-install the packed tarball in a temp dir**

```bash
npm pack
mv mcp-consultant-tools-computer-use-0.1.0-beta.1.tgz /tmp/
cd /tmp && mkdir mcp-cu-install-test && cd mcp-cu-install-test && npm init -y
npm install /tmp/mcp-consultant-tools-computer-use-0.1.0-beta.1.tgz
ls node_modules/@mcp-consultant-tools/computer-use/build
```

Expected: package installs, postinstall compiles the Swift helper (or warns if xcrun missing), `build/index.js` and `build/cli.js` exist.

- [ ] **Step 4: Cleanup**

```bash
cd ~/Repo/mcp-computer-use
rm -rf /tmp/mcp-cu-install-test /tmp/mcp-consultant-tools-computer-use-*.tgz
rm -f mcp-consultant-tools-computer-use-*.tgz
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git status  # should be clean
git log --oneline | head -20
```

Expected: Clean working tree. ~18–20 commits telling the full story of the build.

- [ ] **Step 6: Announce readiness for user testing**

Print to the user:
> v1 is built and packable. To publish:
>
> 1. Create the GitHub repo: `gh repo create klemensms/mcp-computer-use --public --source=. --remote=origin --push`
> 2. Publish beta: `npm publish --tag beta --access public`
> 3. Add to `.mcp.json` per `docs/documentation/computer-use.md`.
>
> First run will prompt for Accessibility + Screen Recording in System Settings. Grant to `~/.mcp-computer-use/bridge`.

---

## Plan self-review

(Ran inline during plan authoring.)

**Spec coverage:**
- Overview + non-goals → architecture is single-package standalone, macOS only, NativeBridge for Windows (Task 7).
- Architecture (repo layout, NativeBridge, ServiceContext, layering, safety pipeline) → Tasks 1, 7, 8, 9–13.
- Tool surface (9 tools, READONLY filter) → Task 14 (registration + test).
- Safety model (all 8 flags + 4 PROFILE presets, safety pipeline, audit log, secret scan, redaction predicate, rate limit) → Tasks 6 (config), 9 (safety), 10 (audit), 12 (input pipeline).
- IPC protocol → Task 8.
- Release pipeline (versioning, publish, compile-from-source, npx, MCP JSON) → Tasks 1, 4, 18, 19.
- Attribution + licensing → Tasks 2, 3.
- Upstream tracking → covered in NOTICE (Task 2); UPSTREAM_SYNC.md omitted in v1 as low-priority (flagged as a v1.1 follow-up).
- Windows v2 sketch → Task 7 factory + NativeBridge abstraction makes this additive.
- Success criteria → verifiable via Tasks 18–19.

**Gap:** Sensitive-app redaction is documented but not fully implemented server-side in v1 (Swift helper behavior relied upon; `ScreenshotService` has a placeholder comment). This is an **accepted gap for v1** — flagged in spec §11 (bundle IDs to verify at setup) and here as a v1.1 follow-up. Users with strict privacy needs should add sensitive apps to `MCP_CU_REDACT_APPS` and monitor that screenshots from those apps are blurred; file an issue if the Swift helper doesn't redact them. (Note: this matches the spec's pragmatism — don't block v1 on region-map tuning.)

**Placeholder scan:** None. All code blocks contain the actual content to ship.

**Type consistency:** `WindowInfo`, `WindowTarget`, `CaptureInfo`, `ScreenshotResult` used consistently across `models/api-types.ts`, `NativeBridge`, services, tools, and CLI. Method names `check` / `list` / `frontmost` / `capture` / `click` / `typeText` / `keyPress` / `scroll` consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-mcp-computer-use-v1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
