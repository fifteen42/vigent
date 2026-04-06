import AppKit
import Foundation

struct AppInfo: Codable {
    let name: String
    let bundleId: String
}

enum AppManager {
    static func getFrontmostApp() -> AppInfo? {
        guard let app = NSWorkspace.shared.frontmostApplication else {
            return nil
        }
        return AppInfo(
            name: app.localizedName ?? "Unknown",
            bundleId: app.bundleIdentifier ?? "unknown"
        )
    }

    static func listRunningApps() -> [AppInfo] {
        return NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular }
            .map { app in
                AppInfo(
                    name: app.localizedName ?? "Unknown",
                    bundleId: app.bundleIdentifier ?? "unknown"
                )
            }
    }

    static func openApp(bundleId: String) -> Bool {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) else {
            return false
        }
        let config = NSWorkspace.OpenConfiguration()
        let semaphore = DispatchSemaphore(value: 0)
        var success = false
        NSWorkspace.shared.openApplication(at: url, configuration: config) { _, error in
            success = error == nil
            semaphore.signal()
        }
        semaphore.wait()
        return success
    }

    static func openAppByName(name: String) -> Bool {
        // Launch the app
        let openProc = Process()
        openProc.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        openProc.arguments = ["-a", name]
        try? openProc.run()
        openProc.waitUntilExit()
        guard openProc.terminationStatus == 0 else { return false }

        // Wait for app to launch
        Thread.sleep(forTimeInterval: 1.0)

        // Activate via NSRunningApplication (native API, no AppleScript)
        if let app = NSWorkspace.shared.runningApplications.first(where: {
            $0.localizedName?.lowercased() == name.lowercased()
        }) {
            app.activate()
            Thread.sleep(forTimeInterval: 0.5)
            // Retry activation if needed
            if NSWorkspace.shared.frontmostApplication?.localizedName?.lowercased() != name.lowercased() {
                app.activate()
            }
        }

        return true
    }
}
