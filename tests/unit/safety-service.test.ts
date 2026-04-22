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
