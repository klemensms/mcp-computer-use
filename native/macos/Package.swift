// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "McpComputerUseHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "McpComputerUseHelper", targets: ["McpComputerUseHelper"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/actuallyepic/background-computer-use.git",
            revision: "dcf55a3feee557ebdcda4afa6241c82dc6abdd8c"
        ),
    ],
    targets: [
        .executableTarget(
            name: "McpComputerUseHelper",
            dependencies: [
                .product(name: "BackgroundComputerUseKit", package: "background-computer-use"),
            ],
            path: "Sources/McpComputerUseHelper"
        ),
    ]
)
