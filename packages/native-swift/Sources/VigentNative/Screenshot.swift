import AppKit
import CoreGraphics
import CoreText
import Foundation

struct ScreenshotResult: Codable {
    let base64: String
    let width: Int
    let height: Int
    let displayId: UInt32
}

struct MarkedScreenshotResult: Codable {
    let screenshot: ScreenshotResult
    let elements: [UIElementBounds]
}

enum Screenshot {
    static func capture(quality: Double = 0.75, maxWidth: Int = 1280, maxHeight: Int = 800) -> ScreenshotResult? {
        let displayId = CGMainDisplayID()
        guard let cgImage = CGDisplayCreateImage(displayId) else { return nil }
        return compress(cgImage, displayId: displayId, quality: quality, maxWidth: maxWidth, maxHeight: maxHeight)
    }

    static func captureRegion(x: Int, y: Int, width: Int, height: Int, quality: Double = 0.75) -> ScreenshotResult? {
        let displayId = CGMainDisplayID()
        let rect = CGRect(x: x, y: y, width: width, height: height)
        guard let cgImage = CGDisplayCreateImage(displayId, rect: rect) else { return nil }

        let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: width, height: height))
        guard let tiffData = nsImage.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let jpegData = bitmap.representation(using: .jpeg, properties: [.compressionFactor: quality])
        else { return nil }

        return ScreenshotResult(
            base64: jpegData.base64EncodedString(),
            width: cgImage.width,
            height: cgImage.height,
            displayId: displayId
        )
    }

    // ── Set-of-Mark: screenshot with numbered element markers ──────────────────

    static func captureWithMarks(
        quality: Double = 0.75,
        maxWidth: Int = 1280,
        maxHeight: Int = 800
    ) -> MarkedScreenshotResult? {
        let displayId = CGMainDisplayID()
        guard let rawImage = CGDisplayCreateImage(displayId) else { return nil }

        // Screen logical size vs device pixel size
        let screenLogicalWidth = Double(CGDisplayPixelsWide(displayId))
        let pixelScale = Double(rawImage.width) / screenLogicalWidth  // e.g. 2.0 on Retina

        // Get interactive elements (screen/logical coordinates)
        let elements = Accessibility.listInteractiveElements()

        // Draw markers onto full-resolution image
        let markedImage = elements.isEmpty ? rawImage : drawMarkers(
            on: rawImage,
            elements: elements,
            pixelScale: pixelScale
        ) ?? rawImage

        // Scale down and compress
        guard let result = compress(markedImage, displayId: displayId, quality: quality, maxWidth: maxWidth, maxHeight: maxHeight)
        else { return nil }

        return MarkedScreenshotResult(screenshot: result, elements: elements)
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private static func compress(
        _ cgImage: CGImage,
        displayId: CGDirectDisplayID,
        quality: Double,
        maxWidth: Int,
        maxHeight: Int
    ) -> ScreenshotResult? {
        let originalWidth = cgImage.width
        let originalHeight = cgImage.height

        let scaleX = Double(maxWidth) / Double(originalWidth)
        let scaleY = Double(maxHeight) / Double(originalHeight)
        let scale = min(scaleX, scaleY, 1.0)

        let targetWidth = Int(Double(originalWidth) * scale)
        let targetHeight = Int(Double(originalHeight) * scale)

        let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: targetWidth, height: targetHeight))
        guard let tiffData = nsImage.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let jpegData = bitmap.representation(using: .jpeg, properties: [.compressionFactor: quality])
        else { return nil }

        return ScreenshotResult(
            base64: jpegData.base64EncodedString(),
            width: targetWidth,
            height: targetHeight,
            displayId: displayId
        )
    }

    private static func drawMarkers(
        on image: CGImage,
        elements: [UIElementBounds],
        pixelScale: Double
    ) -> CGImage? {
        let imgW = image.width
        let imgH = image.height

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        guard let ctx = CGContext(
            data: nil, width: imgW, height: imgH,
            bitsPerComponent: 8, bytesPerRow: 0,
            space: colorSpace, bitmapInfo: bitmapInfo.rawValue
        ) else { return nil }

        // Draw original screenshot
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: imgW, height: imgH))

        let markerFill = CGColor(red: 0.18, green: 0.44, blue: 0.98, alpha: 0.88)
        let white = CGColor(red: 1, green: 1, blue: 1, alpha: 1)
        let markerRadius = 11.0 * pixelScale
        let fontSize = 11.0 * pixelScale

        for element in elements {
            // Convert logical screen coords → CGContext coords
            // Screen: y=0 top, y increases downward
            // CGContext: y=0 bottom, y increases upward
            let cx = element.centerX * pixelScale
            let cy = Double(imgH) - element.centerY * pixelScale

            let rect = CGRect(
                x: cx - markerRadius, y: cy - markerRadius,
                width: markerRadius * 2, height: markerRadius * 2
            )

            // Filled circle
            ctx.setFillColor(markerFill)
            ctx.fillEllipse(in: rect)

            // White ring
            ctx.setStrokeColor(white)
            ctx.setLineWidth(1.5 * pixelScale)
            ctx.strokeEllipse(in: rect)

            // Number label using Core Text
            let label = "\(element.id)" as CFString
            let font = CTFontCreateWithName("Helvetica-Bold" as CFString, fontSize, nil)
            let attrs: [CFString: Any] = [
                kCTFontAttributeName: font,
                kCTForegroundColorAttributeName: white,
            ]
            let attrStr = CFAttributedStringCreate(nil, label, attrs as CFDictionary)!
            let line = CTLineCreateWithAttributedString(attrStr)

            let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
            ctx.textPosition = CGPoint(
                x: cx - bounds.width / 2 - bounds.minX,
                y: cy - bounds.height / 2 - bounds.minY
            )
            CTLineDraw(line, ctx)
        }

        return ctx.makeImage()
    }
}
