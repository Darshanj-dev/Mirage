import XCTest
@testable import MirageCore

final class MirageCoreEngineTests: XCTestCase {
    var core: MirageCoreEngine!
    override func setUpWithError() throws { core = try MirageCoreEngine() }

    // The brief's demo prompt, with fictional values assembled at runtime.
    let awsId = ["AKIA", "Q7Z3", "MIRAGEDEMO", "42"].joined()
    let awsSecret = ["mIr4gEDemo", "FakeKey/xQ9", "zT2vLp8wRn5", "kHs3jQQQ"].joined()
    var demo: String {
        """
        Help me debug my production server.
        AWS_ACCESS_KEY_ID=\(awsId)
        AWS_SECRET_ACCESS_KEY=\(awsSecret)
        My PAN is BNZPM2501K.
        My email is priya.demo@example.com.
        """
    }

    func testLoadsTheSharedCore() {
        XCTAssertEqual(core.version, "1.0.0")
    }

    func testDemoPromptIsCriticalWithExplainedScore() throws {
        let a = try core.analyze(demo)
        XCTAssertEqual(a.risk.level, .critical)
        XCTAssertEqual(a.action, .confirm)
        XCTAssertEqual(a.actionable.map(\.type), ["API_KEY", "API_KEY", "PAN", "EMAIL"])
        XCTAssertEqual(a.actionable.first?.kind, "aws_access_key")
        XCTAssertEqual(a.actionable.first?.severity, .critical)
        XCTAssertEqual(a.risk.lines.reduce(0) { $0 + $1.points }, a.risk.score)
    }

    func testRedactedFormsNeverRevealValues() throws {
        let a = try core.analyze(demo)
        for f in a.findings { XCTAssertFalse(f.redacted.contains(f.value), f.type) }
        XCTAssertEqual(a.findings.first { $0.type == "EMAIL" }?.redacted.hasSuffix("@example.com"), true)
        XCTAssertEqual(a.findings.first { $0.type == "PAN" }?.redacted.hasSuffix("1K"), true)
    }

    func testProtectReplacesSecretsAndHidesPersonalData() throws {
        let p = try core.protect(demo)
        XCTAssertTrue(p.text.contains("«AWS_ACCESS_KEY_REMOVED»"))
        XCTAssertTrue(p.text.contains("«AWS_SECRET_KEY_REMOVED»"))
        XCTAssertTrue(p.text.contains("«PAN_1»"))
        XCTAssertTrue(p.text.contains("«EMAIL_1»"))
        for raw in [awsId, awsSecret, "BNZPM2501K", "priya.demo@example.com"] { XCTAssertFalse(p.text.contains(raw)) }
        XCTAssertEqual(p.removed, 2)
        XCTAssertEqual(p.hidden, 2)
        // A protected prompt checks clean: MIRAGE never flags its own placeholders.
        XCTAssertTrue(try core.analyze(p.text).actionable.isEmpty)
    }

    func testSameValueKeepsItsPlaceholderAcrossPromptsInASession() throws {
        let a = try core.protect("PAN BNZPM2501K")
        let b = try core.protect("again BNZPM2501K and AAACS1234K")
        XCTAssertTrue(a.text.contains("«PAN_1»"))
        XCTAssertTrue(b.text.contains("«PAN_1»") && b.text.contains("«PAN_2»"))
        core.clearSession()
        XCTAssertTrue(try core.protect("AAACS1234K").text.contains("«PAN_1»"))
    }

    func testKeepSendsChosenItemsAsTyped() throws {
        let p = try core.protect("PAN BNZPM2501K mail a.b@example.com", keep: [1])
        XCTAssertTrue(p.text.contains("«PAN_1»"))
        XCTAssertTrue(p.text.contains("a.b@example.com"))
    }

    func testCleanPromptHasNoAction() throws {
        let a = try core.analyze("Explain photosynthesis in simple words.")
        XCTAssertNil(a.action)
        XCTAssertEqual(a.risk.level, .safe)
    }

    func testCategoriesAndPolicyAreHonoured() throws {
        let off = DetectionSettings(categories: [.contact: false])
        XCTAssertTrue(try core.analyze("mail a.b@example.com", settings: off).findings.isEmpty)
        var policy = PolicySettings()
        policy.low = .protect
        XCTAssertEqual(try core.analyze("mail a.b@example.com", policy: policy).action, .protect)
    }

    func testReplyCheckFlagsSecretsNotEmails() throws {
        let r = try core.checkReply("Use key \(awsId) and mail support@example.com")
        XCTAssertEqual(r.findings.map(\.type), ["API_KEY"])
    }

    func testDetectionLatencyForATypicalPrompt() throws {
        _ = try core.analyze(demo) // warm up
        let start = Date()
        for _ in 0..<20 { _ = try core.analyze(demo) }
        let perCall = Date().timeIntervalSince(start) / 20 * 1000
        print("MIRAGE core analyze: \(String(format: "%.2f", perCall)) ms per call")
        XCTAssertLessThan(perCall, 50)
    }
}
