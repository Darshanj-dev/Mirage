// Settings and statistics. Both are small JSON files in Application Support that never contain
// prompt text or values: settings are switches, statistics are counts. A damaged file is
// replaced with defaults (and the damaged copy kept aside), never a crash.

import Foundation
import MirageCore
import os

public struct DesktopSettings: Codable, Equatable {
    public var protectionOn = true
    public var startAtLogin = false
    public var onboardingDone = false
    public var checkReplies = true
    public var apps: [AppID: Bool] = [.chatgpt: true, .claude: true, .gemini: false, .copilot: false, .perplexity: false]
    public var detection = DetectionSettings(categories: Dictionary(uniqueKeysWithValues: Category.allCases.map { ($0, true) }))
    public var policy = PolicySettings()
    /// The "MIRAGE active" badge on the AI app's prompt box. Optional so older settings files
    /// (without the key) still load; nil means on.
    public var showActiveBadge: Bool?
    public var activeBadge: Bool { showActiveBadge ?? true }
    public init() {}

    public func appEnabled(_ id: AppID) -> Bool { apps[id] ?? false }
}

public struct Counts: Codable, Equatable {
    public var checked = 0 // prompts MIRAGE checked before they were sent
    public var held = 0 // sends MIRAGE held for a decision
    public var protectedSends = 0 // sent with something hidden or removed
    public var masked = 0 // personal details replaced by placeholders
    public var secretsRemoved = 0 // secrets replaced before sending
    public var cancelled = 0
    public var sentAnyway = 0
    public var replyWarnings = 0
    public var byCategory: [String: Int] = [:]
    public init() {}

    mutating func add(_ other: Counts) {
        checked += other.checked; held += other.held; protectedSends += other.protectedSends
        masked += other.masked; secretsRemoved += other.secretsRemoved; cancelled += other.cancelled
        sentAnyway += other.sentAnyway; replyWarnings += other.replyWarnings
        for (k, v) in other.byCategory { byCategory[k, default: 0] += v }
    }
}

public struct Stats: Codable, Equatable {
    public var day = ""
    public var today = Counts()
    public var total = Counts()
    public var appsSeen: [String] = [] // AppID raw values only
    public init() {}
}

public enum StoreLocation {
    public static var directory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("MIRAGE", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        return base
    }()
}

public final class JSONStore<Value: Codable & Equatable> {
    private let url: URL
    private let makeDefault: () -> Value
    private let log = Logger(subsystem: "dev.mirage.desktop", category: "store")
    public private(set) var recoveredFromDamage = false

    public init(name: String, directory: URL = StoreLocation.directory, default makeDefault: @escaping () -> Value) {
        url = directory.appendingPathComponent(name)
        self.makeDefault = makeDefault
    }

    public func load() -> Value {
        guard let data = try? Data(contentsOf: url) else { return makeDefault() }
        do {
            return try JSONDecoder().decode(Value.self, from: data)
        } catch {
            // Keep the damaged file for inspection, start over with defaults.
            let aside = url.appendingPathExtension("damaged")
            try? FileManager.default.removeItem(at: aside)
            try? FileManager.default.moveItem(at: url, to: aside)
            recoveredFromDamage = true
            log.error("store \(self.url.lastPathComponent, privacy: .public) was damaged; defaults restored")
            return makeDefault()
        }
    }

    public func save(_ value: Value) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: [.atomic])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}

public extension Stats {
    static func dayKey(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Adds counts, starting a new day's bucket at midnight.
    mutating func record(_ delta: Counts, app: AppID?, now: Date = Date()) {
        let key = Stats.dayKey(now)
        if day != key { day = key; today = Counts() }
        today.add(delta)
        total.add(delta)
        if let app, !appsSeen.contains(app.rawValue) { appsSeen.append(app.rawValue) }
    }
}
