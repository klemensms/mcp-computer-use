import Foundation
import BackgroundComputerUse

/// Wrapper-internal caches. Not surfaced through the wire protocol — used to translate
/// our protocol's UInt32 windowId into upstream's String windowID, and to forward the
/// stateToken upstream returns from getWindowState into subsequent action requests.
final class WrapperState {
    var windowNumberToID: [Int: String] = [:]
    var windowIDToStateToken: [String: String] = [:]
}

enum ProtocolBridge {
    /// Dispatches a single decoded NDJSON request to the appropriate upstream call,
    /// translates the response to our wire shape, and returns it as a JSON-serializable value.
    /// May return either `[String: Any]` (objects) or `[[String: Any]]` (arrays).
    static func handle(
        _ req: [String: Any],
        runtime: BackgroundComputerUseRuntime,
        state: WrapperState
    ) throws -> Any {
        let cmd = (req["cmd"] as? String) ?? ""
        switch cmd {
        case "checkPermissions": return try checkPermissions(runtime: runtime)
        case "listApps":          return try listApps(runtime: runtime)
        case "listWindows":       return try listWindows(req, runtime: runtime, state: state)
        case "getFrontmost":      return try getFrontmost(runtime: runtime, state: state)
        case "screenshot":        return try screenshot(req, runtime: runtime, state: state)
        case "mouseClick":        return try mouseClick(req, runtime: runtime, state: state)
        case "typeText":          return try typeText(req, runtime: runtime, state: state)
        case "keyPress":          return try keyPress(req, runtime: runtime, state: state)
        case "scroll":            return try scroll(req)
        case "shutdown":          return ["ok": true] as [String: Any]
        default:
            throw BridgeError(code: "unknown_cmd", message: "Unknown command: \(cmd)")
        }
    }

    // MARK: - checkPermissions

    private static func checkPermissions(runtime: BackgroundComputerUseRuntime) throws -> [String: Any] {
        let perms = runtime.permissions()
        return [
            "accessibility": perms.accessibility.granted,
            "screenRecording": perms.screenRecording.granted,
        ]
    }

    // MARK: - listApps

    private static func listApps(runtime: BackgroundComputerUseRuntime) throws -> [[String: Any]] {
        let response = runtime.listApps()
        return response.runningApps
            .filter { $0.activationPolicy == "regular" }
            .map { app -> [String: Any] in
                [
                    "appName": app.name,
                    "pid": Int(app.pid),
                    "bundleId": app.bundleID,
                ]
            }
    }

    // MARK: - listWindows

    private static func listWindows(
        _ req: [String: Any],
        runtime: BackgroundComputerUseRuntime,
        state: WrapperState
    ) throws -> [[String: Any]] {
        let bundleIds = try resolveListWindowsTargets(req: req, runtime: runtime)

        var result: [[String: Any]] = []
        for bundleId in bundleIds {
            do {
                let response = try runtime.listWindows(.init(app: bundleId))
                for window in response.windows {
                    state.windowNumberToID[window.windowNumber] = window.windowID
                    result.append(translateWindowDTO(window))
                }
            } catch {
                // Skip apps that fail individually (e.g. accessibility issues for one app shouldn't tank the whole list).
                continue
            }
        }
        return result
    }

    private static func resolveListWindowsTargets(
        req: [String: Any],
        runtime: BackgroundComputerUseRuntime
    ) throws -> [String] {
        if let bundleId = req["bundleId"] as? String, !bundleId.isEmpty {
            return [bundleId]
        }
        if let pidNum = readInt(req, "pid") {
            let apps = runtime.listApps()
            guard let app = apps.runningApps.first(where: { Int($0.pid) == pidNum }) else {
                return []
            }
            return [app.bundleID]
        }
        let apps = runtime.listApps()
        return apps.runningApps
            .filter { $0.activationPolicy == "regular" }
            .map { $0.bundleID }
    }

    private static func translateWindowDTO(_ w: WindowDTO) -> [String: Any] {
        return [
            "windowId": w.windowNumber,
            "windowRef": w.windowID,
            "title": w.title,
            "framePoints": [
                "x": w.frameAppKit.x,
                "y": w.frameAppKit.y,
                "w": w.frameAppKit.width,
                "h": w.frameAppKit.height,
            ],
            "isMinimized": w.isMinimized,
            "isOnscreen": w.isOnScreen,
            "isMain": w.isMain,
            "isFocused": w.isFocused,
        ]
    }

    // MARK: - getFrontmost

    private static func getFrontmost(
        runtime: BackgroundComputerUseRuntime,
        state: WrapperState
    ) throws -> [String: Any] {
        let apps = runtime.listApps()
        guard let frontmost = apps.frontmostApp else {
            throw BridgeError(code: "frontmost_unavailable", message: "No frontmost app available")
        }

        let windows: [WindowDTO]
        do {
            windows = try runtime.listWindows(.init(app: frontmost.bundleID)).windows
        } catch {
            // Frontmost app has no listable windows (e.g. permission issue for that app)
            return frontmostFallback(frontmost: frontmost)
        }

        // Cache windowNumber→windowID for every window we've seen.
        for w in windows {
            state.windowNumberToID[w.windowNumber] = w.windowID
        }

        let chosen = windows.first(where: { $0.isFocused })
            ?? windows.first(where: { $0.isMain })
            ?? windows.first(where: { $0.isOnScreen })
            ?? windows.first

        guard let w = chosen else {
            return frontmostFallback(frontmost: frontmost)
        }

        return [
            "appName": frontmost.name,
            "pid": Int(frontmost.pid),
            "bundleId": frontmost.bundleID,
            "windowTitle": w.title,
            "windowId": w.windowNumber,
            "windowRef": w.windowID,
        ]
    }

    private static func frontmostFallback(frontmost: RunningAppDTO) -> [String: Any] {
        return [
            "appName": frontmost.name,
            "pid": Int(frontmost.pid),
            "bundleId": frontmost.bundleID,
            "windowTitle": "",
            "windowId": 0,
            "windowRef": "",
        ]
    }

    // MARK: - screenshot

    private static func screenshot(
        _ req: [String: Any],
        runtime: BackgroundComputerUseRuntime,
        state: WrapperState
    ) throws -> [String: Any] {
        guard let windowIdNum = readInt(req, "windowId") else {
            throw BridgeError(code: "invalid_request", message: "screenshot requires windowId")
        }
        guard let windowID = state.windowNumberToID[windowIdNum] else {
            throw BridgeError(
                code: "window_not_found",
                message: "windowId \(windowIdNum) not in cache; call listWindows or getFrontmost first"
            )
        }

        let response = try runtime.getWindowState(.init(window: windowID, imageMode: .base64))
        state.windowIDToStateToken[windowID] = response.stateToken

        guard let image = response.screenshot.image, let imageBase64 = image.imageBase64 else {
            throw BridgeError(
                code: "screenshot_unavailable",
                message: "Upstream did not return base64 image"
            )
        }

        let frameWidth = response.window.frameAppKit.width
        let scaleFactor: Double = (frameWidth > 0)
            ? (Double(image.pixelWidth) / frameWidth)
            : 1.0

        return [
            "pngBase64": imageBase64,
            "width": image.pixelWidth,
            "height": image.pixelHeight,
            "scaleFactor": scaleFactor,
        ]
    }

    // MARK: - mouseClick

    private static func mouseClick(
        _ req: [String: Any],
        runtime: BackgroundComputerUseRuntime,
        state: WrapperState
    ) throws -> [String: Any] {
        guard let windowIdNum = readInt(req, "windowId") else {
            throw BridgeError(code: "invalid_request", message: "mouseClick requires windowId")
        }
        guard let windowID = state.windowNumberToID[windowIdNum] else {
            throw BridgeError(code: "window_not_found", message: "windowId \(windowIdNum) not in cache")
        }
        guard let xValue = readDouble(req, "x"), let yValue = readDouble(req, "y") else {
            throw BridgeError(code: "invalid_request", message: "mouseClick requires x and y")
        }

        let response = try runtime.click(.init(
            window: windowID,
            stateToken: state.windowIDToStateToken[windowID],
            x: xValue,
            y: yValue
        ))

        if !response.ok {
            throw BridgeError(code: "click_failed", message: response.summary)
        }

        if let token = response.postStateToken {
            state.windowIDToStateToken[windowID] = token
        }

        return ["clicked": true]
    }

    // MARK: - typeText

    private static func typeText(
        _ req: [String: Any],
        runtime: BackgroundComputerUseRuntime,
        state: WrapperState
    ) throws -> [String: Any] {
        guard let text = req["text"] as? String else {
            throw BridgeError(code: "invalid_request", message: "typeText requires text")
        }

        let frontmostWindowID = try resolveFrontmostWindowID(runtime: runtime, state: state)

        let response = try runtime.typeText(.init(
            window: frontmostWindowID,
            stateToken: state.windowIDToStateToken[frontmostWindowID],
            text: text
        ))

        if !response.ok {
            throw BridgeError(code: "type_text_failed", message: response.summary)
        }

        if let token = response.postStateToken {
            state.windowIDToStateToken[frontmostWindowID] = token
        }

        return ["typed": true]
    }

    // MARK: - keyPress

    private static func keyPress(
        _ req: [String: Any],
        runtime: BackgroundComputerUseRuntime,
        state: WrapperState
    ) throws -> [String: Any] {
        guard let key = req["key"] as? String else {
            throw BridgeError(code: "invalid_request", message: "keyPress requires key")
        }
        let modifiers = (req["modifiers"] as? [String]) ?? []

        let chord = buildPressKeyChord(key: key, modifiers: modifiers)

        let frontmostWindowID = try resolveFrontmostWindowID(runtime: runtime, state: state)

        let response = try runtime.pressKey(.init(
            window: frontmostWindowID,
            stateToken: state.windowIDToStateToken[frontmostWindowID],
            key: chord
        ))

        if !response.ok {
            throw BridgeError(code: "key_press_failed", message: response.summary)
        }

        if let token = response.postStateToken {
            state.windowIDToStateToken[frontmostWindowID] = token
        }

        return [
            "ok": true,
            "key": key,
            "keycode": response.parsedKey?.keyCode ?? 0,
            "modifiers": modifiers,
        ]
    }

    /// Build a `cmd+shift+f` style chord. Normalizes the BackSpace parser quirk and
    /// translates our protocol's `opt` to upstream's accepted `option`.
    private static func buildPressKeyChord(key: String, modifiers: [String]) -> String {
        let normalizedKey = (key.lowercased() == "backspace") ? "BackSpace" : key
        let normalizedMods = modifiers.map { translateModifier($0) }
        return (normalizedMods + [normalizedKey]).joined(separator: "+")
    }

    private static func translateModifier(_ m: String) -> String {
        switch m.lowercased() {
        case "opt", "alt", "option":           return "option"
        case "cmd", "command", "super", "meta": return "cmd"
        case "ctrl", "control":                 return "ctrl"
        case "shift":                           return "shift"
        default:                                return m
        }
    }

    // MARK: - scroll (local CGEvent path)

    private static func scroll(_ req: [String: Any]) throws -> [String: Any] {
        guard let direction = req["direction"] as? String else {
            throw BridgeError(code: "invalid_request", message: "scroll requires direction")
        }
        guard let amount = readInt(req, "amount") else {
            throw BridgeError(code: "invalid_request", message: "scroll requires amount")
        }
        let pid = readInt(req, "pid")

        try LocalScroll.scroll(direction: direction, amount: amount, pid: pid)

        return [
            "ok": true,
            "direction": direction,
            "amount": amount,
        ]
    }

    // MARK: - shared helpers

    /// Resolves the frontmost app's "best" window and returns its upstream windowID.
    /// Caches windowNumber→windowID for the whole window list along the way.
    private static func resolveFrontmostWindowID(
        runtime: BackgroundComputerUseRuntime,
        state: WrapperState
    ) throws -> String {
        let apps = runtime.listApps()
        guard let frontmost = apps.frontmostApp else {
            throw BridgeError(code: "frontmost_unavailable", message: "No frontmost app available")
        }
        let response = try runtime.listWindows(.init(app: frontmost.bundleID))
        for w in response.windows {
            state.windowNumberToID[w.windowNumber] = w.windowID
        }
        let chosen = response.windows.first(where: { $0.isFocused })
            ?? response.windows.first(where: { $0.isMain })
            ?? response.windows.first(where: { $0.isOnScreen })
            ?? response.windows.first
        guard let w = chosen else {
            throw BridgeError(code: "no_window", message: "Frontmost app has no windows")
        }
        return w.windowID
    }

    /// JSONSerialization decodes numbers as NSNumber, which bridges to Int/Int64/Double.
    /// This helper accepts any of those forms so the dispatch layer is robust.
    private static func readInt(_ dict: [String: Any], _ key: String) -> Int? {
        if let v = dict[key] as? Int { return v }
        if let v = dict[key] as? Int64 { return Int(v) }
        if let v = dict[key] as? Double { return Int(v) }
        if let v = dict[key] as? NSNumber { return v.intValue }
        return nil
    }

    private static func readDouble(_ dict: [String: Any], _ key: String) -> Double? {
        if let v = dict[key] as? Double { return v }
        if let v = dict[key] as? Int { return Double(v) }
        if let v = dict[key] as? Int64 { return Double(v) }
        if let v = dict[key] as? NSNumber { return v.doubleValue }
        return nil
    }
}
