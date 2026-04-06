import CoreGraphics
import Foundation

struct RecordedEvent: Codable {
    let timestamp: Double
    let type: String
    let x: Double?
    let y: Double?
    let button: String?
    let clickCount: Int?
    let key: String?
    let keyCode: Int?
    let modifiers: [String]
    let scrollDeltaX: Double?
    let scrollDeltaY: Double?
}

class EventMonitor {
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var tapRunLoop: CFRunLoop?
    private var isRecording = false
    private var startTime: Double = 0

    private let lock = NSLock()
    private var pendingEvents: [RecordedEvent] = []
    private var allEvents: [RecordedEvent] = []

    private var lastClickTime: Double = 0
    private var lastClickX: Double = 0
    private var lastClickY: Double = 0
    private var consecutiveClicks: Int = 0

    func start() {
        guard !isRecording else { return }
        isRecording = true
        startTime = ProcessInfo.processInfo.systemUptime

        lock.lock()
        pendingEvents.removeAll()
        allEvents.removeAll()
        lock.unlock()

        // Run event tap setup and run loop on a GCD thread
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            self?.runEventLoop()
        }
    }

    func stop() -> [RecordedEvent] {
        isRecording = false

        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let rl = tapRunLoop, let source = runLoopSource {
            CFRunLoopRemoveSource(rl, source, .commonModes)
            CFRunLoopStop(rl)
        }

        // Give the run loop time to stop
        Thread.sleep(forTimeInterval: 0.2)

        eventTap = nil
        runLoopSource = nil
        tapRunLoop = nil

        lock.lock()
        let result = allEvents
        lock.unlock()
        return result
    }

    func pollEvents() -> [RecordedEvent] {
        lock.lock()
        let events = pendingEvents
        pendingEvents.removeAll()
        lock.unlock()
        return events
    }

    private func runEventLoop() {
        let eventMask: CGEventMask =
            (1 << CGEventType.leftMouseDown.rawValue) |
            (1 << CGEventType.rightMouseDown.rawValue) |
            (1 << CGEventType.keyDown.rawValue) |
            (1 << CGEventType.scrollWheel.rawValue)

        let selfPtr = Unmanaged.passUnretained(self).toOpaque()

        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: eventMask,
            callback: eventTapCallback,
            userInfo: selfPtr
        ) else {
            fputs("ERROR: Failed to create CGEvent tap. Check Accessibility permissions.\n", stderr)
            return
        }

        self.eventTap = tap

        guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
            fputs("ERROR: Failed to create run loop source.\n", stderr)
            return
        }
        self.runLoopSource = source

        let rl = CFRunLoopGetCurrent()!
        self.tapRunLoop = rl
        CFRunLoopAddSource(rl, source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)

        fputs("INFO: Event tap started on background thread.\n", stderr)

        // Run the loop until stopped
        while isRecording {
            let result = CFRunLoopRunInMode(.defaultMode, 0.25, true)
            if result == .finished {
                break
            }
        }

        fputs("INFO: Event tap loop ended.\n", stderr)
    }

    func handleEvent(type: CGEventType, event: CGEvent) {
        let now = ProcessInfo.processInfo.systemUptime
        let timestamp = now - startTime
        let location = event.location
        let modifiers = parseModifiers(event.flags)

        var recorded: RecordedEvent?

        switch type {
        case .leftMouseDown:
            let clickType = detectClickType(x: location.x, y: location.y, time: timestamp)
            recorded = RecordedEvent(
                timestamp: timestamp, type: clickType,
                x: location.x, y: location.y,
                button: "left", clickCount: clickType == "double_click" ? 2 : 1,
                key: nil, keyCode: nil, modifiers: modifiers,
                scrollDeltaX: nil, scrollDeltaY: nil
            )

        case .rightMouseDown:
            recorded = RecordedEvent(
                timestamp: timestamp, type: "right_click",
                x: location.x, y: location.y,
                button: "right", clickCount: 1,
                key: nil, keyCode: nil, modifiers: modifiers,
                scrollDeltaX: nil, scrollDeltaY: nil
            )

        case .keyDown:
            let keyCode = Int(event.getIntegerValueField(.keyboardEventKeycode))
            let keyName = keycodeToString(keyCode, event: event)
            recorded = RecordedEvent(
                timestamp: timestamp, type: "key",
                x: nil, y: nil,
                button: nil, clickCount: nil,
                key: keyName, keyCode: keyCode, modifiers: modifiers,
                scrollDeltaX: nil, scrollDeltaY: nil
            )

        case .scrollWheel:
            let dy = event.getDoubleValueField(.scrollWheelEventDeltaAxis1)
            let dx = event.getDoubleValueField(.scrollWheelEventDeltaAxis2)
            if abs(dx) > 0.01 || abs(dy) > 0.01 {
                recorded = RecordedEvent(
                    timestamp: timestamp, type: "scroll",
                    x: location.x, y: location.y,
                    button: nil, clickCount: nil,
                    key: nil, keyCode: nil, modifiers: modifiers,
                    scrollDeltaX: dx, scrollDeltaY: dy
                )
            }

        default:
            break
        }

        if let event = recorded {
            lock.lock()
            pendingEvents.append(event)
            allEvents.append(event)
            lock.unlock()
        }
    }

    private func detectClickType(x: Double, y: Double, time: Double) -> String {
        let timeDelta = time - lastClickTime
        let distSq = (x - lastClickX) * (x - lastClickX) + (y - lastClickY) * (y - lastClickY)

        if timeDelta < 0.3 && distSq < 25 {
            consecutiveClicks += 1
        } else {
            consecutiveClicks = 1
        }

        lastClickTime = time
        lastClickX = x
        lastClickY = y

        return consecutiveClicks >= 2 ? "double_click" : "click"
    }

    private func parseModifiers(_ flags: CGEventFlags) -> [String] {
        var mods: [String] = []
        if flags.contains(.maskCommand) { mods.append("command") }
        if flags.contains(.maskShift) { mods.append("shift") }
        if flags.contains(.maskControl) { mods.append("control") }
        if flags.contains(.maskAlternate) { mods.append("alt") }
        return mods
    }

    private func keycodeToString(_ keyCode: Int, event: CGEvent) -> String {
        switch keyCode {
        case 36: return "return"
        case 48: return "tab"
        case 49: return "space"
        case 51: return "backspace"
        case 53: return "escape"
        case 117: return "delete"
        case 123: return "left"
        case 124: return "right"
        case 125: return "down"
        case 126: return "up"
        case 115: return "home"
        case 119: return "end"
        case 116: return "pageup"
        case 121: return "pagedown"
        case 122: return "f1"
        case 120: return "f2"
        case 99: return "f3"
        case 118: return "f4"
        case 96: return "f5"
        case 97: return "f6"
        case 98: return "f7"
        case 100: return "f8"
        case 101: return "f9"
        case 109: return "f10"
        case 103: return "f11"
        case 111: return "f12"
        default:
            // Get character from the event's unicode string
            var length = 0
            event.keyboardGetUnicodeString(maxStringLength: 0, actualStringLength: &length, unicodeString: nil)
            if length > 0 {
                var chars = [UniChar](repeating: 0, count: length)
                event.keyboardGetUnicodeString(maxStringLength: length, actualStringLength: &length, unicodeString: &chars)
                return String(utf16CodeUnits: chars, count: length)
            }
            return "keycode_\(keyCode)"
        }
    }
}

// Free function callback for CGEvent tap (required because closures can't be used as C function pointers)
private func eventTapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    guard let refcon = refcon else { return Unmanaged.passUnretained(event) }
    let monitor = Unmanaged<EventMonitor>.fromOpaque(refcon).takeUnretainedValue()
    monitor.handleEvent(type: type, event: event)
    return Unmanaged.passUnretained(event)
}
