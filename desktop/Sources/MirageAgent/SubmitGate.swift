// The submit gate: a Core Graphics event tap that can hold a prompt's send (Return in the prompt
// box, or a click on the send control) until the user has decided.
//
// Not a keylogger, by construction:
//  - it is ENABLED ONLY while a supported AI app is in front and protection is on;
//  - it only looks at the key code of Return/Enter and at mouse-down positions;
//  - it never reads characters, never stores or logs any event;
//  - everything else passes through untouched, immediately.
// If the tap is disabled by the system (timeout, user input), it re-enables itself.

import AppKit
import ApplicationServices

@MainActor
public protocol SubmitGateDelegate: AnyObject {
    /// Return true to hold the send. Must be fast (it runs inside the event callback).
    func submitGateShouldHold(_ trigger: SubmitTrigger) -> Bool
}

public enum SubmitTrigger: Equatable {
    case returnKey
    case click(CGPoint)
}

@MainActor
public final class SubmitGate {
    public weak var delegate: SubmitGateDelegate?
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    public private(set) var isEnabled = false

    public init() {}

    /// Creates the tap. Fails (returns false) without Accessibility permission.
    public func install() -> Bool {
        if tap != nil { return true }
        let mask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.leftMouseDown.rawValue)
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        guard let port = CGEvent.tapCreate(
            tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
            eventsOfInterest: CGEventMask(mask), callback: submitGateCallback, userInfo: refcon
        ) else { return false }
        tap = port
        source = CFMachPortCreateRunLoopSource(nil, port, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: port, enable: false)
        return true
    }

    public func uninstall() {
        if let tap { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
        if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        tap = nil
        source = nil
        isEnabled = false
    }

    /// On only while a protected app is in front.
    public func setEnabled(_ on: Bool) {
        guard let tap else { isEnabled = false; return }
        CGEvent.tapEnable(tap: tap, enable: on)
        isEnabled = on
    }

    fileprivate func handle(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        switch type {
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap, isEnabled { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        case .keyDown:
            // MIRAGE's own re-send passes; so does anything that isn't a plain Return/Enter.
            if event.getIntegerValueField(.eventSourceUserData) == KeyPoster.marker { return Unmanaged.passUnretained(event) }
            let code = event.getIntegerValueField(.keyboardEventKeycode)
            let flags = event.flags
            let modified = flags.contains(.maskShift) || flags.contains(.maskAlternate) || flags.contains(.maskControl) || flags.contains(.maskCommand)
            guard code == 36 || code == 76, !modified else { return Unmanaged.passUnretained(event) }
            return delegate?.submitGateShouldHold(.returnKey) == true ? nil : Unmanaged.passUnretained(event)
        case .leftMouseDown:
            return delegate?.submitGateShouldHold(.click(event.location)) == true ? nil : Unmanaged.passUnretained(event)
        default:
            return Unmanaged.passUnretained(event)
        }
    }
}

private func submitGateCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    guard let refcon else { return Unmanaged.passUnretained(event) }
    let gate = Unmanaged<SubmitGate>.fromOpaque(refcon).takeUnretainedValue()
    // The tap's run-loop source is on the main run loop, so this is the main thread.
    return MainActor.assumeIsolated { gate.handle(type: type, event: event) }
}
