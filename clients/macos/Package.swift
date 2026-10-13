// swift-tools-version: 5.8
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "SuperAgent",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "SuperAgent",
            targets: ["SuperAgent"]
        )
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "SuperAgent",
            dependencies: [],
            path: "Sources/SuperAgent"
        ),
        .testTarget(
            name: "SuperAgentTests",
            dependencies: ["SuperAgent"],
            path: "Tests/SuperAgentTests"
        )
    ]
)
