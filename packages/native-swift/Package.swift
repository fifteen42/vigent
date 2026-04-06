// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "VigentNative",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "vigent-native", targets: ["VigentNative"]),
    ],
    targets: [
        .executableTarget(
            name: "VigentNative",
            path: "Sources/VigentNative",
            linkerSettings: [
                .linkedFramework("ApplicationServices"),
                .linkedFramework("AppKit"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("Quartz"),
                .linkedFramework("ScreenCaptureKit"),
            ]
        ),
    ]
)
