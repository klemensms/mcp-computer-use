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
