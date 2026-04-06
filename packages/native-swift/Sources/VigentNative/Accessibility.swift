import AppKit
import ApplicationServices
import Foundation

struct UIElementInfo: Codable {
    let role: String
    let title: String?
    let value: String?
    let description: String?
}

enum Accessibility {
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

        // Try setting focus
        AXUIElementSetAttributeValue(el, kAXFocusedAttribute as CFString, true as CFTypeRef)

        // Try performing press action
        AXUIElementPerformAction(el, kAXPressAction as CFString)

        return true
    }

    static func setValueAtPoint(x: Double, y: Double, text: String) -> Bool {
        let systemWide = AXUIElementCreateSystemWide()
        var element: AXUIElement?

        let result = AXUIElementCopyElementAtPosition(systemWide, Float(x), Float(y), &element)
        guard result == .success, let el = element else { return false }

        // Focus the element first
        AXUIElementSetAttributeValue(el, kAXFocusedAttribute as CFString, true as CFTypeRef)

        // Set the value directly
        let setResult = AXUIElementSetAttributeValue(el, kAXValueAttribute as CFString, text as CFTypeRef)
        return setResult == .success
    }

    private static func getAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
        guard result == .success, let val = value else { return nil }

        if let str = val as? String {
            return str
        }
        return String(describing: val)
    }
}
