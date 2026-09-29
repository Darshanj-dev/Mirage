// ⌥⌘M anywhere opens Private Compose. A registered hot key (Carbon): no keyboard monitoring,
// no permission; macOS tells MIRAGE only when this exact combination is pressed.
import AppKit
import Carbon.HIToolbox

@MainActor
final class Hotkey {
    private var ref: EventHotKeyRef?
    private static var action: (() -> Void)?

    func register(_ action: @escaping () -> Void) {
        Hotkey.action = action
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
            DispatchQueue.main.async { MainActor.assumeIsolated { Hotkey.action?() } }
            return noErr
        }, 1, &spec, nil, nil)
        let id = EventHotKeyID(signature: OSType(0x4D495241), id: 1) // "MIRA"
        RegisterEventHotKey(UInt32(kVK_ANSI_M), UInt32(optionKey | cmdKey), id, GetApplicationEventTarget(), 0, &ref)
    }
}
