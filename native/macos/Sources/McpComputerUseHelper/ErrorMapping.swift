import Foundation

struct BridgeError: Error {
    let code: String
    let message: String
}

func mapError(_ error: Error) -> (code: String, message: String) {
    if let bridge = error as? BridgeError {
        return (code: bridge.code, message: bridge.message)
    }

    let raw = String(describing: error)
    let lower = raw.lowercased()

    if lower.contains("unsupportedkey") || lower.contains("unsupported key") {
        return (code: "key_unsupported", message: raw)
    }
    if lower.contains("unsupportedmodifier") || lower.contains("unsupported modifier") {
        return (code: "key_unsupported", message: raw)
    }
    if lower.contains("emptykey") || lower.contains("empty key") {
        return (code: "key_empty", message: raw)
    }
    if lower.contains("windownotfound") || (lower.contains("window") && lower.contains("not found")) {
        return (code: "window_not_found", message: raw)
    }
    if lower.contains("appnotfound") || (lower.contains("app") && lower.contains("not found")) {
        return (code: "app_not_found", message: raw)
    }
    if lower.contains("accessibilitydenied") || (lower.contains("accessibility") && lower.contains("denied")) {
        return (code: "accessibility_denied", message: raw)
    }
    if lower.contains("screen") && (lower.contains("recording") || lower.contains("capture")) {
        return (code: "screen_recording_denied", message: raw)
    }
    if lower.contains("timeout") {
        return (code: "screenshot_timeout", message: raw)
    }
    return (code: "helper_error", message: raw)
}
