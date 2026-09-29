// swift-tools-version: 6.0
// MIRAGE desktop companion for macOS: a menu-bar app that protects prompts in supported AI
// desktop apps. MirageCore runs the shared TypeScript core (lib/core/api.ts, bundled by
// `npm run build:core`) inside JavaScriptCore, so the extension and the desktop app share one
// detector, one risk engine and one masking implementation.
import PackageDescription

let package = Package(
    name: "Mirage",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "MIRAGE", targets: ["MirageApp"]),
    ],
    targets: [
        .target(
            name: "MirageCore",
            exclude: ["Resources"],
            linkerSettings: [.linkedFramework("JavaScriptCore")]
        ),
        .target(
            name: "MirageAgent",
            dependencies: ["MirageCore"],
            linkerSettings: [.linkedFramework("ApplicationServices"), .linkedFramework("AppKit")]
        ),
        .executableTarget(
            name: "MirageApp",
            dependencies: ["MirageCore", "MirageAgent"],
            linkerSettings: [.linkedFramework("ServiceManagement")]
        ),
        .testTarget(name: "MirageCoreTests", dependencies: ["MirageCore"]),
        .testTarget(name: "MirageAgentTests", dependencies: ["MirageAgent", "MirageCore"]),
    ],
    swiftLanguageModes: [.v5]
)
