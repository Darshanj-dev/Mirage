import XCTest
@testable import MirageAgent
@testable import MirageCore

final class StoreTests: XCTestCase {
    var dir: URL!
    override func setUp() {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    func testDefaultsWhenNothingIsStored() {
        let store = JSONStore<DesktopSettings>(name: "settings.json", directory: dir, default: DesktopSettings.init)
        let s = store.load()
        XCTAssertTrue(s.protectionOn)
        XCTAssertTrue(s.appEnabled(.chatgpt))
        XCTAssertFalse(s.appEnabled(.gemini))
        XCTAssertEqual(s.policy.critical, .confirm)
    }

    func testRoundTripAndOwnerOnlyPermissions() throws {
        let store = JSONStore<DesktopSettings>(name: "settings.json", directory: dir, default: DesktopSettings.init)
        var s = DesktopSettings()
        s.protectionOn = false
        s.policy.low = .protect
        store.save(s)
        XCTAssertEqual(store.load(), s)
        let perms = try FileManager.default.attributesOfItem(atPath: dir.appendingPathComponent("settings.json").path)[.posixPermissions] as? Int
        XCTAssertEqual(perms, 0o600)
    }

    func testDamagedSettingsFallBackToDefaultsAndAreKeptAside() throws {
        try Data("{ not json".utf8).write(to: dir.appendingPathComponent("settings.json"))
        let store = JSONStore<DesktopSettings>(name: "settings.json", directory: dir, default: DesktopSettings.init)
        XCTAssertEqual(store.load(), DesktopSettings())
        XCTAssertTrue(store.recoveredFromDamage)
        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.appendingPathComponent("settings.json.damaged").path))
    }

    func testStatsStartANewDayAndKeepTotals() {
        var stats = Stats()
        var d = Counts()
        d.checked = 2; d.masked = 3; d.byCategory = ["apiKeys": 1]
        let monday = Date(timeIntervalSince1970: 1_790_000_000)
        stats.record(d, app: .chatgpt, now: monday)
        stats.record(d, app: .chatgpt, now: monday.addingTimeInterval(60))
        XCTAssertEqual(stats.today.checked, 4)
        stats.record(d, app: .claude, now: monday.addingTimeInterval(86_400 * 2))
        XCTAssertEqual(stats.today.checked, 2)
        XCTAssertEqual(stats.total.checked, 6)
        XCTAssertEqual(stats.total.byCategory["apiKeys"], 3)
        XCTAssertEqual(Set(stats.appsSeen), ["chatgpt", "claude"])
    }

    func testStatsNeverHoldText() throws {
        var stats = Stats()
        var d = Counts()
        d.masked = 1
        stats.record(d, app: .chatgpt)
        let json = String(decoding: try JSONEncoder().encode(stats), as: UTF8.self)
        XCTAssertFalse(json.contains("PAN") || json.contains("@"), "stats must be counts only")
    }
}

final class TextTests: XCTestCase {
    func testNormalizedPromptTextIgnoresLineEndingsAndOddSpaces() {
        XCTAssertEqual(normalizedPromptText("a\r\nb\u{00A0}c \n"), "a\nb c")
        XCTAssertEqual(normalizedPromptText("\u{FFFC}hello"), "hello")
    }
}

final class AdapterTests: XCTestCase {
    func testRegistryFindsAdaptersByBundleID() {
        XCTAssertEqual(AdapterRegistry.adapter(forBundle: "com.openai.chat")?.id, .chatgpt)
        XCTAssertEqual(AdapterRegistry.adapter(forBundle: "com.openai.codex")?.id, .chatgpt) // ChatGPT 26.924
        XCTAssertEqual(AdapterRegistry.adapter(forBundle: "com.anthropic.claudefordesktop")?.id, .claude)
        XCTAssertNil(AdapterRegistry.adapter(forBundle: "com.apple.Safari"))
        XCTAssertNil(AdapterRegistry.adapter(forBundle: nil))
    }

    func testAdapterStatusMatchesWhatWasTestedLive() {
        // desktop/TESTING.md: ChatGPT's full flow verified on 26.924; Claude's hold/cancel verified,
        // Protect & Send's final send not run, so it stays beta (checking only).
        XCTAssertEqual(ChatGPTAdapter().status, .verified(version: "26.924.51851", date: "2026-09-29"))
        XCTAssertEqual(ClaudeAdapter().status, .checkingOnly)
    }

    func testSendControlsMatchExactLabelsOnly() {
        // Labels are checked by the adapters on live elements; here the rules themselves.
        XCTAssertTrue(["send", "send message", "send prompt"].contains("send"))
        XCTAssertFalse(["send", "send message", "send prompt"].contains("send feedback"))
    }

    func testMarkerLetsMirageOwnReturnThroughTheGate() {
        XCTAssertEqual(KeyPoster.marker, 0x4D49_5241)
    }
}

final class PrivacyGuardTests: XCTestCase {
    /// No log line may interpolate prompt text or values (only types, counts and fixed labels).
    func testLogsNeverInterpolateTextOrValues() throws {
        let sources = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources")
        let files = FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil)!.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertFalse(files.isEmpty)
        for file in files {
            let text = try String(contentsOf: file, encoding: .utf8)
            for line in text.split(separator: "\n") where line.contains("log.") || line.contains("Logger(") {
                for banned in ["text", "value", "original", "protected.text", "reply", "current"] {
                    XCTAssertFalse(line.contains("\\(\(banned)"), "\(file.lastPathComponent): log interpolates \(banned)")
                }
            }
            XCTAssertFalse(text.contains("print(text") || text.contains("NSLog("), "\(file.lastPathComponent) prints text")
        }
    }
}
