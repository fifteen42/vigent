import AppKit
import ApplicationServices
import Foundation

struct UIElementInfo: Codable {
    let role: String
    let title: String?
    let value: String?
    let description: String?
}

struct UIElementBounds: Codable {
    let id: Int
    let role: String
    let title: String?
    let value: String?
    let x: Double
    let y: Double
    let width: Double
    let height: Double

    var centerX: Double { x + width / 2 }
    var centerY: Double { y + height / 2 }
}

enum Accessibility {
    static let interactiveRoles: Set<String> = [
        "AXButton", "AXTextField", "AXTextArea", "AXCheckBox",
        "AXRadioButton", "AXLink", "AXMenuItem", "AXComboBox",
        "AXPopUpButton", "AXSearchField", "AXSlider", "AXTab",
        "AXMenuButton", "AXToggle", "AXSwitch",
    ]

    static func checkPermission() -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    static func getElementAtPoint(x: Double, y: Double) -> UIElementInfo? {
        let systemWide = AXUIElementCreateSystemWide()
        var element: AXUIElement?

        let result = AXUIElementCopyElementAtPosition(systemWide, Float(x), Float(y), &element)
        guard result == .success, let el = element else {
            return nil
        }

        return UIElementInfo(
            role: getAttribute(el, kAXRoleAttribute) ?? "unknown",
            title: getAttribute(el, kAXTitleAttribute),
            value: getAttribute(el, kAXValueAttribute),
            description: getAttribute(el, kAXDescriptionAttribute)
        )
    }

    static func getWindowTitle() -> String? {
        guard let app = NSWorkspace.shared.frontmostApplication else { return nil }
        let axApp = AXUIElementCreateApplication(app.processIdentifier)

        var windowRef: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &windowRef)
        guard result == .success, let window = windowRef else { return nil }

        return getAttribute(window as! AXUIElement, kAXTitleAttribute)
    }

    static func focusElementAtPoint(x: Double, y: Double) -> Bool {
        let systemWide = AXUIElementCreateSystemWide()
        var element: AXUIElement?

        let result = AXUIElementCopyElementAtPosition(systemWide, Float(x), Float(y), &element)
        guard result == .success, let el = element else { return false }

        AXUIElementSetAttributeValue(el, kAXFocusedAttribute as CFString, true as CFTypeRef)
        AXUIElementPerformAction(el, kAXPressAction as CFString)
        return true
    }

    static func setValueAtPoint(x: Double, y: Double, text: String) -> Bool {
        let systemWide = AXUIElementCreateSystemWide()
        var element: AXUIElement?

        let result = AXUIElementCopyElementAtPosition(systemWide, Float(x), Float(y), &element)
        guard result == .success, let el = element else { return false }

        AXUIElementSetAttributeValue(el, kAXFocusedAttribute as CFString, true as CFTypeRef)
        let setResult = AXUIElementSetAttributeValue(el, kAXValueAttribute as CFString, text as CFTypeRef)
        return setResult == .success
    }

    // ── Set-of-Mark: list interactive elements ─────────────────────────────────

    static func listInteractiveElements() -> [UIElementBounds] {
        guard let app = NSWorkspace.shared.frontmostApplication else { return [] }
        let axApp = AXUIElementCreateApplication(app.processIdentifier)

        // Try focused window first, fall back to first window
        var windowRef: CFTypeRef?
        var window: AXUIElement?
        if AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &windowRef) == .success,
           let ref = windowRef, CFGetTypeID(ref) == AXUIElementGetTypeID() {
            window = unsafeBitCast(ref, to: AXUIElement.self)
        } else {
            var windowsRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &windowsRef) == .success,
               let windows = windowsRef as? [AXUIElement], !windows.isEmpty {
                window = windows[0]
            }
        }

        guard let rootWindow = window else { return [] }

        var elements: [UIElementBounds] = []
        var counter = 1
        walkAXElement(rootWindow, elements: &elements, counter: &counter, depth: 0)

        // Sort top-to-bottom, left-to-right
        return elements.sorted { a, b in
            if abs(a.y - b.y) > 20 { return a.y < b.y }
            return a.x < b.x
        }
    }

    private static func walkAXElement(
        _ element: AXUIElement,
        elements: inout [UIElementBounds],
        counter: inout Int,
        depth: Int
    ) {
        guard depth < 12, elements.count < 60 else { return }

        let role = getAttribute(element, kAXRoleAttribute) ?? ""

        if interactiveRoles.contains(role), let frame = getFrame(element) {
            // Skip tiny/degenerate elements
            if frame.width >= 8 && frame.height >= 8 {
                let title = getAttribute(element, kAXTitleAttribute)
                    ?? getAttribute(element, kAXDescriptionAttribute)
                let value = getAttribute(element, kAXValueAttribute)
                elements.append(UIElementBounds(
                    id: counter,
                    role: role,
                    title: title,
                    value: value,
                    x: Double(frame.minX),
                    y: Double(frame.minY),
                    width: Double(frame.width),
                    height: Double(frame.height)
                ))
                counter += 1
            }
        }

        // Recurse into children
        var childrenRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success,
              let children = childrenRef as? [AXUIElement] else { return }

        for child in children {
            walkAXElement(child, elements: &elements, counter: &counter, depth: depth + 1)
        }
    }

    static func getFrame(_ element: AXUIElement) -> CGRect? {
        var posRef: CFTypeRef?
        var sizeRef: CFTypeRef?

        guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &posRef) == .success,
              AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeRef) == .success
        else { return nil }

        guard let posValue = posRef, CFGetTypeID(posValue) == AXValueGetTypeID(),
              let sizeValue = sizeRef, CFGetTypeID(sizeValue) == AXValueGetTypeID()
        else { return nil }

        var position = CGPoint.zero
        var size = CGSize.zero
        AXValueGetValue(posValue as! AXValue, .cgPoint, &position)
        AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)

        return CGRect(origin: position, size: size)
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    static func getAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
        guard result == .success, let val = value else { return nil }

        if let str = val as? String { return str }
        return String(describing: val)
    }
}
