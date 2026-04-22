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
