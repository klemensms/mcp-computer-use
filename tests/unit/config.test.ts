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
