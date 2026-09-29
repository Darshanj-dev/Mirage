// Swift mirrors of the MIRAGE Core types (lib/detector/types.ts, lib/risk.ts, lib/core/api.ts).
// Values arrive from the shared TypeScript core as JSON; nothing here re-implements detection.

import Foundation

public enum Severity: String, Codable, CaseIterable, Comparable, Sendable {
    case low, medium, high, critical
    var rank: Int { Severity.allCases.firstIndex(of: self)! }
    public static func < (a: Severity, b: Severity) -> Bool { a.rank < b.rank }
}

public enum RiskLevel: String, Codable, Sendable { case safe, low, high, critical }

public enum Category: String, Codable, CaseIterable, Sendable {
    case identity, contact, financial, credentials, apiKeys, location, health
}

/** What the core recommends for one finding. */
public enum FindingPolicy: String, Codable, Sendable { case mask, block, warn }

/** What the policy screen maps each severity to. */
public enum PolicyAction: String, Codable, CaseIterable, Sendable, Comparable {
    case warn, recommendMask, protect, confirm
    var rank: Int { PolicyAction.allCases.firstIndex(of: self)! }
    public static func < (a: PolicyAction, b: PolicyAction) -> Bool { a.rank < b.rank }
}

public struct Finding: Codable, Sendable, Identifiable {
    public var id: String { "\(start)-\(end)" }
    public let type: String
    public let start: Int // UTF-16 offset, like JavaScript and NSString
    public let end: Int
    /// The raw value. Kept in memory only; never logged, never persisted, never shown in full.
    public let value: String
    public let policy: FindingPolicy
    public let category: Category
    public let severity: Severity
    public let confidence: Double
    public let reason: String
    public let kind: String?
    public let context: String?
    /// Display form that doesn't reveal the value: ████████1234, d*******@gmail.com.
    public let redacted: String
}

public struct RiskLine: Codable, Sendable, Hashable {
    public let label: String
    public let points: Int
    public let count: Int?
}

public struct Risk: Codable, Sendable {
    public let score: Int
    public let level: RiskLevel
    public let lines: [RiskLine]
    public let worst: Severity?
    public init(score: Int, level: RiskLevel, lines: [RiskLine], worst: Severity?) {
        self.score = score; self.level = level; self.lines = lines; self.worst = worst
    }
}

public struct Analysis: Codable, Sendable {
    public let findings: [Finding]
    public let risk: Risk
    public let action: PolicyAction?

    public init(findings: [Finding], risk: Risk, action: PolicyAction?) {
        self.findings = findings; self.risk = risk; self.action = action
    }

    /// Nothing found (also used when the prompt couldn't be read).
    public static let empty = Analysis(findings: [], risk: Risk(score: 0, level: .safe, lines: [], worst: nil), action: nil)

    /// Findings MIRAGE would hide or remove (health terms are only counted).
    public var actionable: [Finding] { findings.filter { $0.policy != .warn } }
    public var hasCritical: Bool { actionable.contains { $0.severity == .critical } }
}

public struct Protection: Codable, Sendable {
    public let text: String
    public let hidden: Int
    public let removed: Int
}

public struct DetectionSettings: Codable, Sendable, Equatable {
    public var safeWords: [String]
    public var alwaysMask: [String]
    public var categories: [Category: Bool]

    public init(safeWords: [String] = [], alwaysMask: [String] = [], categories: [Category: Bool] = [:]) {
        self.safeWords = safeWords
        self.alwaysMask = alwaysMask
        self.categories = categories
    }

    /// The shape lib/detector/types.ts DetectSettings expects.
    var jsonObject: [String: Any] {
        ["safeWords": safeWords, "alwaysMask": alwaysMask,
         "categories": Dictionary(uniqueKeysWithValues: categories.map { ($0.key.rawValue, $0.value) })]
    }
}

public struct PolicySettings: Codable, Sendable, Equatable {
    public var low: PolicyAction = .warn
    public var medium: PolicyAction = .recommendMask
    public var high: PolicyAction = .protect
    public var critical: PolicyAction = .confirm
    public init() {}

    public func action(for s: Severity) -> PolicyAction {
        switch s { case .low: low; case .medium: medium; case .high: high; case .critical: critical }
    }
    var jsonObject: [String: Any] {
        ["low": low.rawValue, "medium": medium.rawValue, "high": high.rawValue, "critical": critical.rawValue]
    }
}
