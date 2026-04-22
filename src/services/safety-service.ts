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
        "APP_NOT_ALLOWED: target bundle ID is unknown; cannot verify against allowlist. Call screenshot or get_frontmost_window first.",
        "APP_NOT_ALLOWED",
        { bundleId }
      );
    }
    if (!this.config.allowedApps.includes(bundleId)) {
      throw new SafetyViolationError(
        `APP_NOT_ALLOWED: app '${bundleId}' is not on the allowlist. Edit MCP_CU_ALLOWED_APPS or set MCP_CU_ALLOW_ALL=1 to bypass.`,
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
          `SECRET_DETECTED: type_text rejected because content matches '${name}'. Use a clipboard paste path or set MCP_CU_SECRET_SCAN=0 if this is intentional.`,
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
