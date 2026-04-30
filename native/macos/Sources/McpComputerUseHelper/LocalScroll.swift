import Foundation
import CoreGraphics

// CGEvent-based scroll lifted from native/macos/bridge.swift:1087-1124 (commit before
// the BackgroundComputerUseKit migration). Upstream's Runtime.scroll requires a semantic
// ActionTargetRequestDTO; until v0.3.0 exposes semantic targeting through the wrapper,
// we keep pixel-coord scroll local.
enum LocalScroll {
    static func scroll(direction: String, amount: Int, pid: Int?) throws {
        let normalized = direction.lowercased()

        // .line units — integer ticks. macOS convention: positive wheel1 = up, positive wheel2 = left.
        var yDelta: Int32 = 0
        var xDelta: Int32 = 0
        switch normalized {
        case "up":    yDelta =  Int32(amount)
        case "down":  yDelta = -Int32(amount)
        case "left":  xDelta =  Int32(amount)
        case "right": xDelta = -Int32(amount)
        default:
            throw BridgeError(
                code: "bad_direction",
                message: "Unknown scroll direction '\(normalized)'; expected up/down/left/right"
            )
        }

        guard let source = CGEventSource(stateID: .combinedSessionState) else {
            throw BridgeError(code: "cg_event_source_failed", message: "Failed to create CGEventSource")
        }
        guard let ev = CGEvent(
            scrollWheelEvent2Source: source,
            units: .line,
            wheelCount: 2,
            wheel1: yDelta,
            wheel2: xDelta,
            wheel3: 0
        ) else {
            throw BridgeError(code: "cg_scroll_event_failed", message: "Failed to create scroll event")
        }

        if let pid = pid {
            ev.postToPid(Int32(pid))
        } else {
            ev.post(tap: .cghidEventTap)
        }
    }
}
