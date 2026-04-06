import AppKit
import Foundation

// VigentNative CLI — communicates via JSON over stdin/stdout
// Protocol: read JSON command from stdin, write JSON response to stdout

struct Command: Decodable {
    let action: String
    let params: [String: AnyCodable]?
}

struct Response: Encodable {
    let success: Bool
    let data: AnyCodable?
    let error: String?
}

// Simple AnyCodable wrapper for JSON bridging
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intVal = try? container.decode(Int.self) {
            value = intVal
        } else if let doubleVal = try? container.decode(Double.self) {
            value = doubleVal
        } else if let boolVal = try? container.decode(Bool.self) {
            value = boolVal
        } else if let stringVal = try? container.decode(String.self) {
            value = stringVal
        } else if let arrayVal = try? container.decode([AnyCodable].self) {
            value = arrayVal.map { $0.value }
        } else if let dictVal = try? container.decode([String: AnyCodable].self) {
            value = dictVal.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let val as Int: try container.encode(val)
        case let val as Double: try container.encode(val)
        case let val as Bool: try container.encode(val)
        case let val as String: try container.encode(val)
        case let val as [Any]:
            try container.encode(val.map { AnyCodable($0) })
        case let val as [String: Any]:
            try container.encode(val.mapValues { AnyCodable($0) })
        case is NSNull: try container.encodeNil()
        default: try container.encodeNil()
        }
    }
}

func toDouble(_ value: Any?) -> Double? {
    if let d = value as? Double { return d }
    if let i = value as? Int { return Double(i) }
    return nil
}

func handleCommand(_ command: Command) -> Response {
    switch command.action {
    case "screenshot":
        let quality = (command.params?["quality"]?.value as? Double) ?? 0.75
        let maxWidth = (command.params?["maxWidth"]?.value as? Int) ?? 1280
        let maxHeight = (command.params?["maxHeight"]?.value as? Int) ?? 800
        if let result = Screenshot.capture(quality: quality, maxWidth: maxWidth, maxHeight: maxHeight) {
            let dict: [String: Any] = [
                "base64": result.base64,
                "width": result.width,
                "height": result.height,
                "displayId": result.displayId,
            ]
            return Response(success: true, data: AnyCodable(dict), error: nil)
        }
        return Response(success: false, data: nil, error: "Screenshot capture failed")

    case "frontmost_app":
        if let app = AppManager.getFrontmostApp() {
            let dict: [String: Any] = ["name": app.name, "bundleId": app.bundleId]
            return Response(success: true, data: AnyCodable(dict), error: nil)
        }
        return Response(success: false, data: nil, error: "No frontmost app")

    case "running_apps":
        let apps = AppManager.listRunningApps().map { ["name": $0.name, "bundleId": $0.bundleId] }
        return Response(success: true, data: AnyCodable(apps), error: nil)

    case "open_app":
        guard let name = command.params?["name"]?.value as? String else {
            return Response(success: false, data: nil, error: "Missing 'name' param")
        }
        let ok = AppManager.openAppByName(name: name)
        return Response(success: ok, data: nil, error: ok ? nil : "Failed to open \(name)")

    case "open_app_bundle":
        guard let bundleId = command.params?["bundleId"]?.value as? String else {
            return Response(success: false, data: nil, error: "Missing 'bundleId' param")
        }
        let ok = AppManager.openApp(bundleId: bundleId)
        return Response(success: ok, data: nil, error: ok ? nil : "Failed to open \(bundleId)")

    case "element_at_point":
        guard let x = toDouble(command.params?["x"]?.value),
              let y = toDouble(command.params?["y"]?.value)
        else {
            return Response(success: false, data: nil, error: "Missing x/y params")
        }
        if let info = Accessibility.getElementAtPoint(x: x, y: y) {
            let dict: [String: Any] = [
                "role": info.role,
                "title": info.title as Any,
                "value": info.value as Any,
                "description": info.description as Any,
            ]
            return Response(success: true, data: AnyCodable(dict), error: nil)
        }
        return Response(success: false, data: nil, error: "No element at point")

    case "window_title":
        if let title = Accessibility.getWindowTitle() {
            return Response(success: true, data: AnyCodable(title), error: nil)
        }
        return Response(success: false, data: nil, error: "No window title")

    case "check_accessibility":
        let ok = Accessibility.checkPermission()
        return Response(success: true, data: AnyCodable(ok), error: nil)

    case "display_size":
        if let screen = NSScreen.main {
            let frame = screen.frame
            let backing = screen.backingScaleFactor
            let dict: [String: Any] = [
                "logicalWidth": Int(frame.width),
                "logicalHeight": Int(frame.height),
                "physicalWidth": Int(frame.width * backing),
                "physicalHeight": Int(frame.height * backing),
                "scaleFactor": backing,
            ]
            return Response(success: true, data: AnyCodable(dict), error: nil)
        }
        return Response(success: false, data: nil, error: "No main screen")

    case "focus_element":
        guard let x = toDouble(command.params?["x"]?.value),
              let y = toDouble(command.params?["y"]?.value)
        else {
            return Response(success: false, data: nil, error: "Missing x/y params")
        }
        let focused = Accessibility.focusElementAtPoint(x: x, y: y)
        return Response(success: focused, data: nil, error: focused ? nil : "Failed to focus element")

    case "set_value":
        guard let x = toDouble(command.params?["x"]?.value),
              let y = toDouble(command.params?["y"]?.value),
              let text = command.params?["text"]?.value as? String
        else {
            return Response(success: false, data: nil, error: "Missing x/y/text params")
        }
        let ok = Accessibility.setValueAtPoint(x: x, y: y, text: text)
        return Response(success: ok, data: nil, error: ok ? nil : "Failed to set value")

    case "start_recording":
        eventMonitor.start()
        return Response(success: true, data: nil, error: nil)

    case "stop_recording":
        let events = eventMonitor.stop()
        let encoder = JSONEncoder()
        if let jsonData = try? encoder.encode(events),
           let jsonArray = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] {
            return Response(success: true, data: AnyCodable(jsonArray), error: nil)
        }
        return Response(success: true, data: AnyCodable([Any]()), error: nil)

    case "poll_events":
        let events = eventMonitor.pollEvents()
        let encoder = JSONEncoder()
        if let jsonData = try? encoder.encode(events),
           let jsonArray = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] {
            return Response(success: true, data: AnyCodable(jsonArray), error: nil)
        }
        return Response(success: true, data: AnyCodable([Any]()), error: nil)

    default:
        return Response(success: false, data: nil, error: "Unknown action: \(command.action)")
    }
}

let eventMonitor = EventMonitor()

// Main loop: read JSON lines from stdin, write JSON lines to stdout
let decoder = JSONDecoder()
let encoder = JSONEncoder()

while let line = readLine() {
    guard let data = line.data(using: .utf8),
          let command = try? decoder.decode(Command.self, from: data)
    else {
        let errResponse = Response(success: false, data: nil, error: "Invalid JSON")
        if let jsonData = try? encoder.encode(errResponse) {
            print(String(data: jsonData, encoding: .utf8)!)
        }
        continue
    }

    let response = handleCommand(command)
    if let jsonData = try? encoder.encode(response) {
        print(String(data: jsonData, encoding: .utf8)!)
        fflush(stdout)
    }
}
