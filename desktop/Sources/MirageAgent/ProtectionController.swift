// The protection workflow, the same for every app:
//   Return / send click in a protected app
//     -> SubmitGate holds it (the event is dropped: the app never sees it)
//     -> read the prompt box -> MIRAGE Core analyze -> nothing actionable? let it through
//     -> otherwise show the decision panel ("Your information has NOT been sent yet" is shown
//        only in this path, because the send event really was held)
//   Protect & send: protect -> write into the box -> read back and compare (mandatory)
//     -> only if identical, send; otherwise put the original back and say so
//   Cancel: close; the prompt is untouched.  Send anyway: critical items need a second confirm.
// Nothing here logs prompt text or values; logs name types and counts only.

import AppKit
import ApplicationServices
import MirageCore
import os

public enum AppProtectionState: Equatable {
    case protecting // held sends are checked; the adapter's flow is verified on this version
    case beta // held sends are checked and every step is verified at run time; not yet tested by hand on this version
    case notRunning
    case off // turned off in settings
    case needsPermission
    case unsupported
}

public struct AppRow: Identifiable, Equatable {
    public var id: AppID
    public var name: String
    public var state: AppProtectionState
}

public enum DecisionStage: Equatable {
    case review // the main panel
    case confirmSend // "This may expose a credential to the AI service."
    case working
    case failed(String) // a verified failure message
}

public struct Decision {
    public let app: AppID
    public let appName: String
    public let analysis: Analysis
    /// True only when the send event was actually held (the claim "not sent yet" depends on it).
    public let heldSubmission: Bool
    /// The prompt couldn't be read: MIRAGE doesn't know what is in it.
    public let unreadable: Bool
    public var keep: Set<Int> = []
    public var stage: DecisionStage = .review
    fileprivate let original: String
    fileprivate let appElement: AXElement
    fileprivate let input: AXElement?
}

public extension Decision {
    /// For UI snapshots and previews only: a decision with no app behind it.
    static func preview(appName: String, analysis: Analysis, stage: DecisionStage = .review) -> Decision {
        var d = Decision(app: .chatgpt, appName: appName, analysis: analysis, heldSubmission: true, unreadable: false,
                         original: "", appElement: AXUIElementCreateApplication(0), input: nil)
        d.stage = stage
        return d
    }
}

public struct ReplyAlert: Identifiable {
    public let id = UUID()
    public let appName: String
    public let analysis: Analysis
    public init(appName: String, analysis: Analysis) { self.appName = appName; self.analysis = analysis }
}

/// The live state of the prompt box, drawn over the AI app like the extension's badge and underlines.
public struct LiveMarks: Equatable {
    public enum Kind: Equatable { case personal, secret, warn }
    public struct Mark: Equatable {
        public let rect: CGRect
        public let kind: Kind
        public let name: String // the kind of detail, e.g. "PAN" (never the value)
        public let sentAs: String? // «PAN_1», «AWS_ACCESS_KEY_REMOVED»; nil: kept as typed
    }
    public let box: CGRect
    public let count: Int
    public let level: RiskLevel
    public let score: Int
    public let hasSecret: Bool
    public let names: [String]
    public let marks: [Mark]
}

public struct Toast: Equatable {
    public let text: String
    public let success: Bool
}

@MainActor
public final class ProtectionController: ObservableObject, SubmitGateDelegate {
    @Published public private(set) var settings: DesktopSettings
    @Published public private(set) var stats: Stats
    @Published public private(set) var apps: [AppRow] = []
    @Published public var decision: Decision?
    @Published public private(set) var liveRisk: RiskLevel = .safe
    /// What the prompt box shows right now, for the on-screen badge and underlines (like the
    /// extension's). Rectangles are in screen coordinates (top-left origin). nil: nothing to show.
    @Published public private(set) var live: LiveMarks?
    /// The prompt box's position, for placing the decision panel right above it.
    @Published public private(set) var promptBoxFrame: CGRect?
    @Published public var replyAlert: ReplyAlert?
    @Published public var toast: Toast?
    @Published public private(set) var coreStatus: String = "Starting"
    @Published public private(set) var coreVersion: String?
    @Published public private(set) var gateActive = false
    @Published public private(set) var lastDetectionMs: Double?
    /// Why the gate last decided what it did: a fixed code, never text (diagnostics).
    public private(set) var lastGateReason = "none"
    public private(set) var gateEvents = 0
    /// When the last send was held, and how long the gate's own check took (diagnostics).
    public private(set) var lastHoldAt: CFAbsoluteTime = 0
    public private(set) var lastGateMs: Double = 0

    public let permissions = PermissionManager()
    private var core: MirageCoreEngine?
    private let gate = SubmitGate()
    private let monitor = AppMonitor()
    private let inputObserver = InputObserver()
    private let settingsStore = JSONStore<DesktopSettings>(name: "settings.json", default: DesktopSettings.init)
    private let statsStore = JSONStore<Stats>(name: "stats.json", default: Stats.init)
    private let log = Logger(subsystem: "dev.mirage.desktop", category: "protection")
    private var front: (adapter: DesktopAIAdapter, pid: pid_t, app: AXElement)?
    private var prepared = Set<pid_t>()
    private var replyWatch: Task<Void, Never>?
    /// The prompt box last seen with focus in the front app (to fail closed if a focus query times out).
    private var lastInput: (element: AXElement, seen: Date)?
    /// Where the front app's send button is, refreshed as the prompt changes. A click is matched
    /// against this rectangle: asking "what is under the mouse?" at click time is too slow in
    /// Electron apps (seen live: ChatGPT clicks passed unchecked).
    private var sendFrame: CGRect?
    /// Where the prompt box is (clicks around it, not in it, may be on a send button not yet cached).
    private var inputFrame: CGRect?
    /// A held send is being checked in the background: anything else is held too until it's done.
    private var checking = false
    public private(set) var lastCheckMs: Double = 0

    private func refreshSendFrame(front: (adapter: DesktopAIAdapter, pid: pid_t, app: AXElement), input: AXElement) {
        if let send = front.adapter.sendControl(app: front.app, near: input), let f = AX.frame(send), f.width > 0 {
            sendFrame = f
        }
    }

    public var settingsWereRecovered: Bool { settingsStore.recoveredFromDamage }
    /// True while MIRAGE's decision panel has keyboard focus: its keys are for the panel.
    public var isDecisionPanelKey: () -> Bool = { false }
    /// True if a screen point (top-left origin) is on one of MIRAGE's own windows: those clicks
    /// are MIRAGE's, never held (the decision panel sits right above the prompt box).
    public var isOnMirageWindow: (CGPoint) -> Bool = { _ in false }

    public init() {
        settings = settingsStore.load()
        stats = statsStore.load()
    }

    // MARK: - lifecycle

    public func start() {
        AX.setGlobalTimeout(0.5)
        startCore()
        gate.delegate = self
        permissions.onChange = { [weak self] granted in self?.permissionChanged(granted) }
        permissions.start()
        monitor.onChange = { [weak self] app in self?.frontChanged(app) }
        monitor.onWake = { [weak self] in self?.recover(reason: "wake") }
        monitor.start()
        inputObserver.onChange = { [weak self] in self?.refreshLiveRisk() }
        permissionChanged(permissions.accessibilityGranted)
    }

    private func startCore() {
        do {
            let engine = try MirageCoreEngine()
            core = engine
            coreVersion = engine.version
            coreStatus = "Running"
        } catch {
            core = nil
            coreStatus = "Failed to load"
            log.error("core failed to load")
        }
    }

    /// Re-establishes everything after sleep/wake, a permission change or an app restart.
    public func recover(reason: String) {
        log.info("recovering: \(reason, privacy: .public)")
        if core == nil { startCore() }
        permissions.refresh()
        gate.uninstall()
        prepared.removeAll()
        permissionChanged(permissions.accessibilityGranted)
    }

    private func permissionChanged(_ granted: Bool) {
        if granted {
            if !gate.install() { log.error("event tap could not be created") }
        } else {
            gate.uninstall()
            decision = nil
        }
        frontChanged(monitor.current())
    }

    // MARK: - front app

    private func frontChanged(_ app: AppMonitor.FrontApp?) {
        inputObserver.stop()
        front = nil
        sendFrame = nil
        inputFrame = nil
        live = nil
        checking = false
        lastInput = nil
        lastLiveText = nil
        liveRisk = .safe
        if let app, let adapter = AdapterRegistry.adapter(forBundle: app.bundleID),
           adapter.status != .unsupported, settings.appEnabled(adapter.id), settings.protectionOn,
           permissions.accessibilityGranted, core != nil {
            let element = AX.app(pid: app.pid)
            if !prepared.contains(app.pid) {
                adapter.prepare(app: element)
                prepared.insert(app.pid)
            }
            front = (adapter, app.pid, element)
            inputObserver.observe(app: element, pid: app.pid)
            refreshLiveRisk() // prime the prompt-box and send-button caches
        }
        gate.setEnabled(front != nil)
        gateActive = gate.isEnabled
        refreshApps()
    }

    public func refreshApps() {
        apps = AdapterRegistry.all.map { a in
            let state: AppProtectionState
            if a.status == .unsupported { state = .unsupported }
            else if !settings.appEnabled(a.id) || !settings.protectionOn { state = .off }
            else if !permissions.accessibilityGranted { state = .needsPermission }
            else if !AppMonitor.isRunning(bundleIDs: a.bundleIdentifiers) { state = .notRunning }
            else if case .verified = a.status { state = .protecting }
            else { state = .beta }
            return AppRow(id: a.id, name: a.displayName, state: state)
        }
    }

    // MARK: - the gate

    /// The gate's decision, made in well under a millisecond from cached state only.
    ///
    /// macOS disables an event tap that takes too long and then DELIVERS the event it was holding,
    /// so the check can never run here: a long prompt (slow to read through Accessibility) let a
    /// send through while MIRAGE was still checking (reported by a user, ChatGPT 26.924). Instead:
    /// hold at once, check in the background, re-send the user's own Return or click (marked as
    /// MIRAGE's) when the prompt is clean, otherwise open the decision.
    public func submitGateShouldHold(_ trigger: SubmitTrigger) -> Bool {
        gateEvents += 1
        let gateStart = CFAbsoluteTimeGetCurrent()
        defer { lastGateMs = (CFAbsoluteTimeGetCurrent() - gateStart) * 1000 }
        guard let front, core != nil else { lastGateReason = "noProtectedFront"; return false }
        if decision != nil && isDecisionPanelKey() { return false } // the panel's own keys
        switch trigger {
        case .returnKey:
            break // every plain Return in a protected app is held and checked
        case .click(let p):
            if isOnMirageWindow(p) { lastGateReason = "clickOnMirage"; return false }
            // Only clicks on (or near) the send button; clicks in the text itself pass untouched.
            let onSend = sendFrame.map { $0.insetBy(dx: -4, dy: -4).contains(p) } ?? false
            let nearBox = inputFrame.map { !$0.contains(p) && $0.insetBy(dx: -160, dy: -160).contains(p) } ?? false
            guard onSend || nearBox else { lastGateReason = "clickNotSend"; return false }
        }
        if decision != nil || checking { lastGateReason = "heldWhileBusy"; return true }
        checking = true
        lastHoldAt = CFAbsoluteTimeGetCurrent()
        checkHeld(trigger, front: front)
        return true
    }

    /// Background check of a held send. Clean → the same Return or click is sent again, at once.
    private func checkHeld(_ trigger: SubmitTrigger, front: (adapter: DesktopAIAdapter, pid: pid_t, app: AXElement)) {
        guard let core else { checking = false; return }
        let settings = settings
        let lastKnownInput = lastInput?.element
        axQueue.async { [weak self] in
            enum Verdict { case pass, decide(Analysis, String, AXElement), unreadable(AXElement?) }
            let verdict: Verdict = {
                var input: AXElement?
                switch trigger {
                case .returnKey:
                    guard let focused = AX.focusedElement(of: front.app) else { return lastKnownInput.map { .unreadable($0) } ?? .pass }
                    guard front.adapter.isInput(focused) else { return .pass } // Return in another field
                    input = focused
                case .click(let p):
                    var el = AX.element(at: p)
                    var isSend = false
                    for _ in 0..<4 {
                        guard let e = el, AX.pid(e) == front.pid else { break }
                        if front.adapter.isSendControl(e) { isSend = true; break }
                        el = AX.parent(e)
                    }
                    guard isSend else { return .pass }
                    input = lastKnownInput ?? front.adapter.inputElement(app: front.app)
                }
                guard let input, let text = front.adapter.readInput(input) else { return .unreadable(input) }
                guard let analysis = try? core.analyze(text, settings: settings.detection, policy: settings.policy) else { return .unreadable(input) }
                return analysis.actionable.isEmpty ? .pass : .decide(analysis, text, input)
            }()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.checking = false
                    self.lastCheckMs = (CFAbsoluteTimeGetCurrent() - self.lastHoldAt) * 1000
                    var delta = Counts()
                    switch verdict {
                    case .pass:
                        self.lastGateReason = "clean"
                        delta.checked = 1
                        self.record(delta, app: front.adapter.id)
                        self.replay(trigger, pid: front.pid)
                        if case .returnKey = trigger { self.scheduleReplyCheck(front: front) }
                    case .decide(let analysis, let text, let input):
                        self.lastGateReason = "held"
                        delta.checked = 1
                        delta.held = 1
                        self.record(delta, app: front.adapter.id)
                        self.lastInput = (input, Date())
                        self.log.info("held a send: \(analysis.actionable.count, privacy: .public) items, level \(analysis.risk.level.rawValue, privacy: .public)")
                        self.decision = Decision(app: front.adapter.id, appName: front.adapter.displayName, analysis: analysis, heldSubmission: true, unreadable: false, original: text, appElement: front.app, input: input)
                    case .unreadable(let input):
                        self.lastGateReason = "unreadable"
                        self.decision = Decision(app: front.adapter.id, appName: front.adapter.displayName, analysis: Analysis.empty, heldSubmission: true, unreadable: true, original: "", appElement: front.app, input: input)
                    }
                }
            }
        }
    }

    /// Sends the user's held Return or click on, marked as MIRAGE's own so the gate lets it pass.
    private func replay(_ trigger: SubmitTrigger, pid: pid_t) {
        switch trigger {
        case .returnKey: _ = KeyPoster.postReturn(to: pid)
        case .click(let p): KeyPoster.click(at: p)
        }
    }

    private func isSendClick(_ p: CGPoint, front: (adapter: DesktopAIAdapter, pid: pid_t, app: AXElement)) -> Bool {
        if let f = sendFrame {
            if f.insetBy(dx: -3, dy: -3).contains(p) { return true }
            // Near it: the box may have grown and moved the button. Look again, once.
            if f.insetBy(dx: -160, dy: -160).contains(p), let input = lastInput?.element {
                refreshSendFrame(front: front, input: input)
                if let g = sendFrame, g.insetBy(dx: -3, dy: -3).contains(p) { return true }
            }
        }
        guard var el = AX.element(at: p), AX.pid(el) == front.pid else { return false }
        for _ in 0..<4 { // the click may land on the icon inside the button
            if front.adapter.isSendControl(el) { return true }
            guard let up = AX.parent(el) else { return false }
            el = up
        }
        return false
    }

    private func present(_ d: Decision) {
        // Show after the event callback returns.
        DispatchQueue.main.async { MainActor.assumeIsolated { self.decision = d } }
    }

    // MARK: - decisions

    public func toggleKeep(_ index: Int) {
        guard var d = decision, index < d.analysis.findings.count else { return }
        let f = d.analysis.findings[index]
        guard f.policy != .warn else { return }
        if d.keep.contains(index) { d.keep.remove(index) } else { d.keep.insert(index) }
        decision = d
    }

    public func cancel() {
        guard decision != nil else { return }
        var delta = Counts()
        delta.cancelled = 1
        record(delta, app: decision?.app)
        decision = nil // the prompt is untouched: MIRAGE never wrote to it
    }

    /// "Send anyway": asks first when anything critical is in the prompt (or it couldn't be read).
    public func sendAnyway(confirmed: Bool) {
        guard var d = decision else { return }
        if (d.analysis.hasCritical || d.unreadable) && !confirmed {
            d.stage = .confirmSend
            decision = d
            return
        }
        guard let input = d.input ?? front.flatMap({ $0.adapter.inputElement(app: $0.app) }), let adapter = adapter(for: d.app) else {
            fail("MIRAGE couldn't reach the message box. Your message has not been submitted.")
            return
        }
        decision = nil
        var delta = Counts()
        delta.sentAnyway = 1
        record(delta, app: d.app)
        if adapter.submit(app: d.appElement, input: input) {
            scheduleReplyCheck(front: front)
        } else {
            toast = Toast(text: "MIRAGE couldn't press Send. Your message is still in the box.", success: false)
        }
    }

    private enum ProtectOutcome {
        case edited(String) // the prompt changed while the panel was open
        case failed(String) // a message that is true
        case sent(Protection)
        case notConfirmed(Protection)
    }

    public func protectAndSend() {
        guard var d = decision, let core, let input = d.input, let adapter = adapter(for: d.app), d.stage != .working else { return }
        d.stage = .working
        decision = d
        // The panel keeps showing (with a spinner) but gives keyboard focus back to the app:
        // typed input only reaches the app's focused window.
        NSRunningApplication(processIdentifier: AX.pid(d.appElement) ?? 0)?.activate()
        let settings = settings
        let original = d.original
        let keep = Array(d.keep)
        axQueue.async { [weak self] in
            let outcome: ProtectOutcome = {
                Thread.sleep(forTimeInterval: 0.15)
                guard let current = adapter.readInput(input) else {
                    return .failed("MIRAGE couldn't read the message box. Your original message has not been submitted.")
                }
                if normalizedPromptText(current) != normalizedPromptText(original) { return .edited(current) }
                guard let protected = try? core.protect(original, settings: settings.detection, keep: keep) else {
                    return .failed("Protection could not be verified. Your original message has not been submitted.")
                }
                guard adapter.replaceInput(input, with: protected.text) == .verified else {
                    // Put the user's text back exactly, then say what is true.
                    let restored = adapter.replaceInput(input, with: original) == .verified
                    return .failed(restored
                        ? "Protection could not be verified. Your original message has not been submitted."
                        : "Protection could not be verified. Your message has not been submitted — check the message box before sending.")
                }
                guard adapter.submit(app: d.appElement, input: input) else {
                    return .failed("Your message was protected but MIRAGE couldn't send it. It is still in the box, protected.")
                }
                // Sent means the app took the text out of the box. Until then, MIRAGE claims nothing.
                let expected = normalizedPromptText(protected.text)
                for _ in 0..<30 {
                    Thread.sleep(forTimeInterval: 0.1)
                    if normalizedPromptText(adapter.readInput(input) ?? "") != expected { return .sent(protected) }
                }
                return .notConfirmed(protected)
            }()
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self?.finishProtect(outcome, decision: d, core: core) }
            }
        }
    }

    private func finishProtect(_ outcome: ProtectOutcome, decision d: Decision, core: MirageCoreEngine) {
        switch outcome {
        case .edited(let text):
            guard let fresh = try? core.analyze(text, settings: settings.detection, policy: settings.policy) else { return }
            decision = Decision(app: d.app, appName: d.appName, analysis: fresh, heldSubmission: true, unreadable: false, original: text, appElement: d.appElement, input: d.input)
        case .failed(let message):
            log.error("protect flow stopped before sending")
            fail(message)
        case .sent(let protected):
            var delta = Counts()
            delta.protectedSends = 1
            delta.masked = protected.hidden
            delta.secretsRemoved = protected.removed
            for f in d.analysis.actionable { delta.byCategory[f.category.rawValue, default: 0] += 1 }
            record(delta, app: d.app)
            decision = nil
            toast = Toast(text: "Sent protected · \(protected.hidden) hidden · \(protected.removed) removed", success: true)
            scheduleReplyCheck(front: front)
        case .notConfirmed:
            log.error("send not confirmed by the app")
            decision = nil
            toast = Toast(text: "\(d.appName) didn't send. Your protected message is in the box: press Send.", success: false)
        }
    }

    private func fail(_ message: String) {
        guard var d = decision else { return }
        d.stage = .failed(message)
        decision = d
    }

    private func adapter(for id: AppID) -> DesktopAIAdapter? { AdapterRegistry.all.first { $0.id == id } }

    // MARK: - live risk and reply check

    /// Accessibility reads for the live shield and the send-button cache run here, off the main
    /// thread, so typing in the AI app never waits on MIRAGE. Results are applied on main.
    private let axQueue = DispatchQueue(label: "dev.mirage.ax", qos: .utility)
    private var lastLiveText: String?

    private func refreshLiveRisk() {
        guard let front, let core else { liveRisk = .safe; live = nil; return }
        let settings = settings
        axQueue.async { [weak self] in
            guard let input = front.adapter.inputElement(app: front.app), let text = front.adapter.readInput(input) else {
                DispatchQueue.main.async { MainActor.assumeIsolated { self?.liveRisk = .safe; self?.live = nil } }
                return
            }
            let send = front.adapter.sendControl(app: front.app, near: input).flatMap(AX.frame)
            let inputBox = AX.frame(input)
            let analysis = try? core.analyze(text, settings: settings.detection, policy: settings.policy)
            let sentAs = (try? core.previewPlaceholders(text, settings: settings.detection)) ?? []
            // Where each finding is on screen, for the underlines: asked of the box, else of the text
            // runs inside it (browser-based editors answer per run), else estimated from the run's width.
            let runs = AX.findAll(in: input, maxDepth: 12, maxNodes: 600) { AX.role($0) == kAXStaticTextRole }
                .compactMap { el -> (el: AXElement, text: String, frame: CGRect)? in
                    guard let t = AX.value(el), !t.isEmpty, let f = AX.frame(el), f.width > 0 else { return nil }
                    return (el, t, f)
                }
            var used: [Int: Int] = [:] // run index → search position, so repeated values map in order
            let marks: [LiveMarks.Mark] = (analysis?.findings ?? []).enumerated().compactMap { index, f in
                let kind: LiveMarks.Kind = f.policy == .block ? .secret : f.policy == .warn ? .warn : .personal
                let placeholder = index < sentAs.count ? sentAs[index] : nil
                func mark(_ rect: CGRect) -> LiveMarks.Mark { LiveMarks.Mark(rect: rect, kind: kind, name: f.kind ?? f.type, sentAs: placeholder) }
                if let rect = AX.bounds(of: input, start: f.start, length: f.end - f.start) { return mark(rect) }
                for (i, run) in runs.enumerated() {
                    let ns = run.text as NSString
                    let from = used[i] ?? 0
                    let hit = ns.range(of: f.value, range: NSRange(location: from, length: ns.length - from))
                    guard hit.location != NSNotFound else { continue }
                    used[i] = hit.location + hit.length
                    if let rect = AX.bounds(of: run.el, start: hit.location, length: hit.length) { return mark(rect) }
                    let perChar = run.frame.width / CGFloat(max(1, ns.length))
                    return mark(CGRect(x: run.frame.minX + perChar * CGFloat(hit.location), y: run.frame.minY,
                                       width: perChar * CGFloat(hit.length), height: run.frame.height))
                }
                return nil
            }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self, self.front?.pid == front.pid else { return }
                    self.lastInput = (input, Date())
                    if let send, send.width > 0 { self.sendFrame = send }
                    if let box = inputBox, box.width > 0 { self.inputFrame = box; self.promptBoxFrame = box }
                    self.lastLiveText = text
                    self.liveRisk = analysis?.risk.level ?? .safe
                    if let analysis, let box = inputBox, !analysis.findings.isEmpty {
                        self.live = LiveMarks(box: box, count: analysis.actionable.count, level: analysis.risk.level, score: analysis.risk.score,
                                              hasSecret: analysis.actionable.contains { $0.policy == .block },
                                              names: analysis.findings.map(\.type), marks: marks)
                    } else if let box = inputBox {
                        self.live = LiveMarks(box: box, count: 0, level: .safe, score: 0, hasSecret: false, names: [], marks: [])
                    } else {
                        self.live = nil
                    }
                }
            }
        }
    }

    /// After a send: snapshot the conversation's findings, then — once the reply has stopped
    /// changing — check what is new. Off the main thread; bounded to 90 s; never changes the reply.
    private func scheduleReplyCheck(front: (adapter: DesktopAIAdapter, pid: pid_t, app: AXElement)?) {
        guard settings.checkReplies, let front, let core else { return }
        replyWatch?.cancel()
        let settings = settings.detection
        let token = UUID()
        replyToken = token
        axQueue.async { [weak self] in
            let key = { (f: Finding) in f.type + "|" + f.value.replacingOccurrences(of: " ", with: "").uppercased() }
            let before = Set(((try? core.checkReply(front.adapter.latestReply(app: front.app) ?? "", settings: settings))?.findings ?? []).map(key))
            var last: String?
            for _ in 0..<45 {
                Thread.sleep(forTimeInterval: 2)
                let stillWanted = DispatchQueue.main.sync { MainActor.assumeIsolated { self?.replyToken == token } }
                guard stillWanted, let reply = front.adapter.latestReply(app: front.app) else { return }
                if reply == last {
                    guard let a = try? core.checkReply(reply, settings: settings) else { return }
                    let fresh = a.findings.filter { !before.contains(key($0)) }
                    guard !fresh.isEmpty else { return }
                    let analysis = Analysis(findings: fresh, risk: a.risk, action: .warn)
                    DispatchQueue.main.async {
                        MainActor.assumeIsolated {
                            var delta = Counts()
                            delta.replyWarnings = 1
                            self?.record(delta, app: front.adapter.id)
                            self?.replyAlert = ReplyAlert(appName: front.adapter.displayName, analysis: analysis)
                        }
                    }
                    return
                }
                last = reply
            }
        }
    }
    private var replyToken: UUID?

    // MARK: - Private Compose

    public enum InsertOutcome: Equatable { case inserted(hidden: Int, removed: Int), notRunning, noPromptBox, notVerified, noPermission }

    /// Supported apps that are running now (targets for Private Compose).
    public func composeTargets() -> [AppRow] {
        AdapterRegistry.all.filter { $0.status != .unsupported && AppMonitor.isRunning(bundleIDs: $0.bundleIdentifiers) }
            .map { AppRow(id: $0.id, name: $0.displayName, state: .protecting) }
    }

    /// Private Compose: the prompt was written in MIRAGE's window, never in the AI app. Protect it,
    /// bring the app forward, type only the protected text into its prompt box, and verify it by
    /// reading back. MIRAGE does not press Send: the user checks it in the app and sends.
    public func insertProtected(_ text: String, keep: [Int], into id: AppID, done: @escaping (InsertOutcome) -> Void) {
        guard permissions.accessibilityGranted else { done(.noPermission); return }
        guard let core, let adapter = AdapterRegistry.all.first(where: { $0.id == id }),
              let running = NSWorkspace.shared.runningApplications.first(where: { adapter.bundleIdentifiers.contains($0.bundleIdentifier ?? "") }) else {
            done(.notRunning)
            return
        }
        let settings = settings
        running.activate()
        axQueue.async { [weak self] in
            let app = AX.app(pid: running.processIdentifier)
            adapter.prepare(app: app)
            Thread.sleep(forTimeInterval: 0.35) // let the app come forward: typing reaches the focused window only
            let outcome: InsertOutcome = {
                guard let input = adapter.inputElement(app: app) else { return .noPromptBox }
                guard let protected = try? core.protect(text, settings: settings.detection, keep: keep) else { return .notVerified }
                guard adapter.replaceInput(input, with: protected.text) == .verified else { return .notVerified }
                return .inserted(hidden: protected.hidden, removed: protected.removed)
            }()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if case .inserted(let hidden, let removed) = outcome {
                        var delta = Counts()
                        delta.masked = hidden
                        delta.secretsRemoved = removed
                        self?.record(delta, app: id)
                    }
                    done(outcome)
                }
            }
        }
    }

    // MARK: - settings and stats

    public func update(_ change: (inout DesktopSettings) -> Void) {
        var s = settings
        change(&s)
        settings = s
        settingsStore.save(s)
        frontChanged(monitor.current())
    }

    private func record(_ delta: Counts, app: AppID?) {
        stats.record(delta, app: app)
        statsStore.save(stats)
    }

    public func resetStats() {
        stats = Stats()
        statsStore.save(stats)
    }

    public func clearSessionPlaceholders() { core?.clearSession() }

    public var coreEngine: MirageCoreEngine? { core }
}
