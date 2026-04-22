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
