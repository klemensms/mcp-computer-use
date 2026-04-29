import Foundation
import BackgroundComputerUse

// stderr logging — stdout is reserved for NDJSON protocol responses, one per line.
@inline(__always)
func logStderr(_ msg: String) {
    if let data = (msg + "\n").data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}

/// Writes a single NDJSON line to stdout.
func sendResponse(_ obj: [String: Any]) {
    do {
        let data = try JSONSerialization.data(withJSONObject: obj, options: [])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
    } catch {
        logStderr("Failed to encode response: \(error)")
    }
}

let runtime = BackgroundComputerUseRuntime()
let wrapperState = WrapperState()

@MainActor
func handleLine(_ line: String) {
    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    let fallbackId = "invalid"
    var requestId: String = fallbackId
    var cmdName: String? = nil

    do {
        guard let data = trimmed.data(using: .utf8) else {
            sendResponse([
                "id": fallbackId,
                "ok": false,
                "error": ["code": "invalid_request", "message": "Input was not valid UTF-8"],
            ])
            return
        }
        guard let req = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            sendResponse([
                "id": fallbackId,
                "ok": false,
                "error": ["code": "invalid_request", "message": "Request must be a JSON object"],
            ])
            return
        }
        requestId = (req["id"] as? String) ?? fallbackId
        cmdName = req["cmd"] as? String

        let result = try ProtocolBridge.handle(req, runtime: runtime, state: wrapperState)
        sendResponse(["id": requestId, "ok": true, "result": result])
    } catch let err as BridgeError {
        sendResponse([
            "id": requestId,
            "ok": false,
            "error": ["code": err.code, "message": err.message],
        ])
    } catch {
        let mapped = mapError(error)
        sendResponse([
            "id": requestId,
            "ok": false,
            "error": ["code": mapped.code, "message": mapped.message],
        ])
    }

    // Schedule exit after the reply has been flushed. Use the global queue so the
    // stdin read loop on this thread doesn't need a pumped main RunLoop.
    if cmdName == "shutdown" {
        DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(25)) {
            exit(0)
        }
    }
}

// stdin loop. FileHandle.availableData blocks until data arrives or EOF.
var stdinBuffer = Data()
let newline = Data([0x0A])
let stdin = FileHandle.standardInput

while true {
    autoreleasepool {
        let chunk = stdin.availableData
        if chunk.isEmpty {
            // EOF — clean exit.
            exit(0)
        }
        stdinBuffer.append(chunk)

        while let range = stdinBuffer.range(of: newline) {
            let lineData = stdinBuffer.subdata(in: 0..<range.lowerBound)
            stdinBuffer.removeSubrange(0..<range.upperBound)
            if let line = String(data: lineData, encoding: .utf8) {
                handleLine(line)
            }
        }
    }
}
