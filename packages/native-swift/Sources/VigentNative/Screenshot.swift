import AppKit
import CoreGraphics
import Foundation

struct ScreenshotResult: Codable {
    let base64: String
    let width: Int
    let height: Int
    let displayId: UInt32
}

enum Screenshot {
    static func capture(quality: Double = 0.75, maxWidth: Int = 1280, maxHeight: Int = 800) -> ScreenshotResult? {
        let displayId = CGMainDisplayID()
        guard let cgImage = CGDisplayCreateImage(displayId) else {
            return nil
        }

        let originalWidth = cgImage.width
        let originalHeight = cgImage.height

        // Calculate scaled dimensions maintaining aspect ratio
        let scaleX = Double(maxWidth) / Double(originalWidth)
        let scaleY = Double(maxHeight) / Double(originalHeight)
        let scale = min(scaleX, scaleY, 1.0)

        let targetWidth = Int(Double(originalWidth) * scale)
        let targetHeight = Int(Double(originalHeight) * scale)

        let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: targetWidth, height: targetHeight))
        guard let tiffData = nsImage.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let jpegData = bitmap.representation(using: .jpeg, properties: [.compressionFactor: quality])
        else {
            return nil
        }

        let base64 = jpegData.base64EncodedString()
        return ScreenshotResult(
            base64: base64,
            width: targetWidth,
            height: targetHeight,
            displayId: displayId
        )
    }

    static func captureRegion(x: Int, y: Int, width: Int, height: Int, quality: Double = 0.75) -> ScreenshotResult? {
        let displayId = CGMainDisplayID()
        let rect = CGRect(x: x, y: y, width: width, height: height)
        guard let cgImage = CGDisplayCreateImage(displayId, rect: rect) else {
            return nil
        }

        let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: width, height: height))
        guard let tiffData = nsImage.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let jpegData = bitmap.representation(using: .jpeg, properties: [.compressionFactor: quality])
        else {
            return nil
        }

        let base64 = jpegData.base64EncodedString()
        return ScreenshotResult(
            base64: base64,
            width: cgImage.width,
            height: cgImage.height,
            displayId: displayId
        )
    }
}
