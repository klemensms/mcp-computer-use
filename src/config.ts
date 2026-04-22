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
