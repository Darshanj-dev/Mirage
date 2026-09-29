// Runs MIRAGE Core (lib/core/api.ts, bundled as mirage-core.js) inside JavaScriptCore, the
// JavaScript engine built into macOS. One source of truth: the desktop app and the browser
// extension run the very same detector, risk engine and masking code.
//
// JSContext is not thread-safe, so every call runs on one private serial queue. Nothing here
// logs text or values.

import Foundation
import JavaScriptCore
import os

public enum MirageCoreError: Error, Equatable {
    case scriptNotFound
    case scriptFailed(String)
    case callFailed(String)
}

public final class MirageCoreEngine: @unchecked Sendable {
    private let context: JSContext
    private let queue = DispatchQueue(label: "dev.mirage.core", qos: .userInitiated)
    private let log = Logger(subsystem: "dev.mirage.desktop", category: "core")
    private var tokenState: String? // placeholder map for this session only (in memory)
    public let version: String

    /// Loads the bundled core. Throws if the script is missing or fails to evaluate.
    public init(scriptURL: URL? = nil) throws {
        guard let url = scriptURL ?? MirageCoreEngine.defaultScriptURL(),
              let source = try? String(contentsOf: url, encoding: .utf8) else { throw MirageCoreError.scriptNotFound }
        guard let ctx = JSContext() else { throw MirageCoreError.scriptFailed("no JSContext") }
        var failure: String?
        ctx.exceptionHandler = { _, exception in failure = exception?.toString() }
        ctx.evaluateScript(source)
        if let failure { throw MirageCoreError.scriptFailed(failure) }
        guard let v = ctx.objectForKeyedSubscript("MirageCore")?.objectForKeyedSubscript("CORE_VERSION")?.toString(),
              v != "undefined" else { throw MirageCoreError.scriptFailed("MirageCore missing") }
        context = ctx
        version = v
    }

    /// mirage-core.js inside the app bundle, or next to the sources during development and tests.
    public static func defaultScriptURL() -> URL? {
        if let url = Bundle.main.url(forResource: "mirage-core", withExtension: "js") { return url }
        let dev = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Resources/mirage-core.js")
        return FileManager.default.fileExists(atPath: dev.path) ? dev : nil
    }

    // MARK: - calls

    private func call(_ function: String, _ args: [Any]) throws -> Data {
        try queue.sync {
            var failure: String?
            context.exceptionHandler = { _, exception in failure = exception?.toString() }
            guard let fn = context.objectForKeyedSubscript("MirageCore")?.objectForKeyedSubscript(function),
                  let result = fn.call(withArguments: args) else { throw MirageCoreError.callFailed(function) }
            if let failure {
                // The exception text could quote input: log the function name only.
                log.error("core call failed: \(function, privacy: .public)")
                throw MirageCoreError.callFailed(String(failure.prefix(0)) + function)
            }
            guard let json = context.objectForKeyedSubscript("JSON")?.objectForKeyedSubscript("stringify")?.call(withArguments: [result])?.toString(),
                  let data = json.data(using: .utf8) else { throw MirageCoreError.callFailed(function) }
            return data
        }
    }

    public func analyze(_ text: String, settings: DetectionSettings = .init(), policy: PolicySettings = .init()) throws -> Analysis {
        try JSONDecoder().decode(Analysis.self, from: call("analyze", [text, settings.jsonObject, policy.jsonObject]))
    }

    /// The protected prompt. Placeholders for personal data are remembered for this session
    /// only (in memory), so the same value keeps the same placeholder across prompts.
    public func protect(_ text: String, settings: DetectionSettings = .init(), keep: [Int] = []) throws -> Protection {
        let state: Any = tokenStateObject() ?? NSNull()
        let data = try call("protect", [text, settings.jsonObject, state, keep])
        struct Raw: Decodable { let text: String; let hidden: Int; let removed: Int; let state: JSONValue }
        let raw = try JSONDecoder().decode(Raw.self, from: data)
        queue.sync { tokenState = raw.state.jsonString }
        return Protection(text: raw.text, hidden: raw.hidden, removed: raw.removed)
    }

    /// What protect() would produce right now, without remembering any placeholder (for previews).
    public func previewProtect(_ text: String, settings: DetectionSettings = .init(), keep: [Int] = []) throws -> Protection {
        let state: Any = tokenStateObject() ?? NSNull()
        let data = try call("protect", [text, settings.jsonObject, state, keep])
        struct Raw: Decodable { let text: String; let hidden: Int; let removed: Int }
        let raw = try JSONDecoder().decode(Raw.self, from: data)
        return Protection(text: raw.text, hidden: raw.hidden, removed: raw.removed)
    }

    /// What each finding of `analyze(text)` would be sent as (nil for kept health details).
    public func previewPlaceholders(_ text: String, settings: DetectionSettings = .init()) throws -> [String?] {
        let state: Any = tokenStateObject() ?? NSNull()
        return try JSONDecoder().decode([String?].self, from: call("previewPlaceholders", [text, settings.jsonObject, state]))
    }

    public func checkReply(_ text: String, settings: DetectionSettings = .init()) throws -> Analysis {
        try JSONDecoder().decode(Analysis.self, from: call("checkReply", [text, settings.jsonObject, [String]()]))
    }

    /// Forgets every placeholder of this session (menu: "Clear session placeholders").
    public func clearSession() { queue.sync { tokenState = nil } }

    private func tokenStateObject() -> Any? {
        queue.sync {
            guard let s = tokenState, let d = s.data(using: .utf8) else { return nil }
            return try? JSONSerialization.jsonObject(with: d)
        }
    }
}

/// Minimal JSON passthrough, to keep the token state opaque to Swift.
struct JSONValue: Decodable {
    let jsonString: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        let any = try c.decode(AnyCodable.self)
        let data = try JSONSerialization.data(withJSONObject: any.value, options: [.fragmentsAllowed])
        jsonString = String(decoding: data, as: UTF8.self)
    }
}

private struct AnyCodable: Decodable {
    let value: Any
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = NSNull() }
        else if let b = try? c.decode(Bool.self) { value = b }
        else if let n = try? c.decode(Double.self) { value = n }
        else if let s = try? c.decode(String.self) { value = s }
        else if let a = try? c.decode([AnyCodable].self) { value = a.map(\.value) }
        else { value = try c.decode([String: AnyCodable].self).mapValues(\.value) }
    }
}
