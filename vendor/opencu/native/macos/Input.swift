import Foundation
import AppKit
import ApplicationServices

final class Cancellation {
    private let lock = NSLock()
    private var epoch = 0
    func current() -> Int { lock.lock(); defer { lock.unlock() }; return epoch }
    func stop() { lock.lock(); epoch += 1; lock.unlock() }
}

final class InputStore {
    let journal: URL
    let cancellation: Cancellation
    var actionEpoch = 0
    var keys = Set<UInt16>()
    var buttons = Set<Int>()
    var recoveryRequired = false
    var activePID: pid_t?
    var activeWindow: AXUIElement?
    var moved: ((CGPoint) throws -> Void)?
    var released: (() -> Void)?
    let source = CGEventSource(stateID: .combinedSessionState)
    let backgroundSource = CGEventSource(stateID: .privateState)
    private let targets = TargetStore()
    private(set) var destination: [String: Any]?
    private var lastPoint: CGPoint?
    var background: Bool { destination != nil }
    var eventSource: CGEventSource? { background ? backgroundSource : source }

    func route(to target: [String: Any]?) throws {
        if !keys.isEmpty || !buttons.isEmpty {
            let same = destination == nil && target == nil || destination != nil && target != nil
                && targets.sameIdentity(destination?["identity"] as? [String: Any] ?? [:], target?["identity"] as? [String: Any] ?? [:])
            guard same else { throw NativeFailure("RELEASE_REQUIRED", "Release held input before changing target or input mode.", held()) }
        }
        if let target = target {
            guard target["windowId"] is Int else { throw NativeFailure("BACKGROUND_WINDOW_REQUIRED", "Select a specific application window for background input.") }
            _ = try targets.validated(target)
        }
        if destination?["id"] as? String != target?["id"] as? String { lastPoint = nil }
        destination = target
    }

    private func post(_ event: CGEvent, keyboard: Bool = false, releasing: Bool = false) throws {
        if let target = destination {
            _ = try targets.validated(target)
            let pid = pid_t(target["pid"] as? Int ?? 0)
            guard pid > 0, let windowId = target["windowId"] as? Int else { throw NativeFailure("TARGET_IDENTITY_REQUIRED", "Targeted input requires a live window and process.") }
            if keyboard && !releasing {
                let window = try targets.axWindow(target), root = AXUIElementCreateApplication(pid)
                guard let focused = attribute(root, kAXFocusedWindowAttribute), CFEqual(focused, window) else {
                    throw NativeFailure("BACKGROUND_KEYBOARD_UNAVAILABLE", "The selected window is not this application's keyboard window. Use an AX element action, or explicitly request foreground input; no window was activated.")
                }
            }
            event.setIntegerValueField(.eventTargetUnixProcessID, value: Int64(pid))
            event.setIntegerValueField(.mouseEventWindowUnderMousePointer, value: Int64(windowId))
            event.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent, value: Int64(windowId))
            event.postToPid(pid)
        } else { event.post(tap: .cghidEventTap) }
    }

    init(directory: URL, cancellation: Cancellation) throws {
        self.journal = directory.appendingPathComponent("input-journal.json")
        self.cancellation = cancellation
        if FileManager.default.fileExists(atPath: journal.path) {
            let data = try Data(contentsOf: journal)
            guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                [1, 2].contains(value["version"] as? Int ?? 0), let k = value["keys"] as? [Int], let b = value["buttons"] as? [Int],
                k.allSatisfy({ $0 >= 0 && $0 <= 127 }), b.allSatisfy({ $0 >= 0 && $0 <= 2 }) else {
                throw NativeFailure("INPUT_JOURNAL_INVALID", "Held input journal is invalid; it was not overwritten.")
            }
            if value["version"] as? Int == 2, !["background", "foreground"].contains(value["mode"] as? String ?? "") {
                throw NativeFailure("INPUT_JOURNAL_INVALID", "Input journal has no valid delivery mode; it was not overwritten.")
            }
            keys = Set(k.map { UInt16($0) }); buttons = Set(b)
            if value["mode"] as? String == "background" {
                guard let saved = value["target"] as? [String: Any], saved["identity"] is [String: Any], saved["windowId"] is Int else {
                    throw NativeFailure("INPUT_JOURNAL_INVALID", "Background input journal has no target identity; it was not overwritten.")
                }
                destination = saved
            }
            if let p = value["point"] as? [String: Double], let x = p["x"], let y = p["y"], x.isFinite, y.isFinite { lastPoint = CGPoint(x: x, y: y) }
            recoveryRequired = !keys.isEmpty || !buttons.isEmpty
        }
    }

    func persist() throws {
        var value: [String: Any] = ["version": 2, "keys": keys.sorted().map { Int($0) }, "buttons": buttons.sorted(), "mode": background ? "background" : "foreground"]
        if let destination = destination { value["target"] = destination }
        if let point = lastPoint { value["point"] = ["x": point.x, "y": point.y] }
        try JSONSerialization.data(withJSONObject: value, options: .sortedKeys).write(to: journal, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: journal.path)
    }

    func check() throws {
        if cancellation.current() != actionEpoch { throw NativeFailure("CONTROL_STOPPED", "Native action was interrupted by stop/release.") }
        if recoveryRequired { throw NativeFailure("RELEASE_REQUIRED", "Previous held input must be released before further actions.", held()) }
        if let destination = destination { _ = try targets.validated(destination); return }
        if let pid = activePID, NSWorkspace.shared.frontmostApplication?.processIdentifier != pid {
            throw NativeFailure("TARGET_NOT_ACTIVE", "Foreground application changed during native input; action stopped.")
        }
        if let window = activeWindow, let pid = activePID {
            let root = AXUIElementCreateApplication(pid)
            guard let focused = attribute(root, kAXFocusedWindowAttribute), CFEqual(focused, window) else {
                throw NativeFailure("TARGET_WINDOW_NOT_ACTIVE", "Focused window changed during native input; action stopped.")
            }
        }
    }

    func held() -> [String: Any] { ["heldKeys": keys.sorted().map { Int($0) }, "heldButtons": buttons.sorted()] }

    func flags() -> CGEventFlags {
        var flags: CGEventFlags = []
        if keys.contains(55) || keys.contains(54) { flags.insert(.maskCommand) }
        if keys.contains(56) || keys.contains(60) { flags.insert(.maskShift) }
        if keys.contains(58) || keys.contains(61) { flags.insert(.maskAlternate) }
        if keys.contains(59) || keys.contains(62) { flags.insert(.maskControl) }
        if keys.contains(63) { flags.insert(.maskSecondaryFn) }
        return flags
    }

    func key(_ code: UInt16, down: Bool, releasing: Bool = false) throws {
        if !releasing { try check() }
        try requireInput()
        if down && IsSecureEventInputEnabled() { throw NativeFailure("SECURE_INPUT_ACTIVE", "macOS Secure Event Input is active; keyboard input was not posted.") }
        if down && (keys.contains(code) || !background && CGEventSource.keyState(.combinedSessionState, key: code)) {
            throw NativeFailure("INPUT_ALREADY_HELD", "Key is already held by OpenCU or the user; it was not acquired.", ["keyCode": code])
        }
        if !down && !keys.contains(code) { return }
        guard let event = CGEvent(keyboardEventSource: eventSource, virtualKey: code, keyDown: down) else { throw NativeFailure("INPUT_EVENT_FAILED", "Could not allocate keyboard event.") }
        if down { keys.insert(code); try persist() }
        // Key-up excludes the released modifier, without clearing the durable journal yet.
        let saved = keys
        if !down { keys.remove(code) }
        event.flags = flags()
        keys = saved
        try post(event, keyboard: true, releasing: releasing)
        pump(0.012)
        guard CGPreflightPostEventAccess(), background || CGEventSource.keyState(.combinedSessionState, key: code) == down else {
            throw NativeFailure("INPUT_EVENT_UNCONFIRMED", "Keyboard state did not confirm the posted event; held journal was retained.", ["keyCode": code, "down": down, "permissions": permissions()])
        }
        if !down {
            keys.remove(code)
            do { try persist() } catch { keys.insert(code); throw error }
        }
    }

    func button(_ button: Int, point: CGPoint, down: Bool, clicks: Int = 1, releasing: Bool = false) throws {
        if !releasing { try check() }
        try requireInput()
        guard button >= 0 && button <= 2 else { throw NativeFailure("INVALID_ACTION", "Mouse button must be left, right or middle.") }
        if down && (buttons.contains(button) || !background && CGEventSource.buttonState(.combinedSessionState, button: CGMouseButton(rawValue: UInt32(button))!)) {
            throw NativeFailure("INPUT_ALREADY_HELD", "Mouse button is already held by OpenCU or the user; it was not acquired.")
        }
        if !down && !buttons.contains(button) { return }
        let types: [(CGEventType, CGEventType)] = [(.leftMouseDown, .leftMouseUp), (.rightMouseDown, .rightMouseUp), (.otherMouseDown, .otherMouseUp)]
        guard let event = CGEvent(mouseEventSource: eventSource, mouseType: down ? types[button].0 : types[button].1,
            mouseCursorPosition: point, mouseButton: CGMouseButton(rawValue: UInt32(button))!) else { throw NativeFailure("INPUT_EVENT_FAILED", "Could not allocate mouse event.") }
        lastPoint = point
        if down { buttons.insert(button); try persist() }
        event.flags = flags(); event.setIntegerValueField(.mouseEventClickState, value: Int64(clicks))
        try post(event, releasing: releasing); pump(0.012)
        guard CGPreflightPostEventAccess(), background || CGEventSource.buttonState(.combinedSessionState, button: CGMouseButton(rawValue: UInt32(button))!) == down else {
            throw NativeFailure("INPUT_EVENT_UNCONFIRMED", "Mouse state did not confirm the posted event; held journal was retained.", ["button": button, "down": down, "permissions": permissions()])
        }
        if !down {
            buttons.remove(button)
            do { try persist() } catch { buttons.insert(button); throw error }
        }
    }

    func move(_ point: CGPoint) throws {
        try check(); try requireInput()
        let heldButton = buttons.sorted().first
        let type: CGEventType = heldButton == 0 ? .leftMouseDragged : heldButton == 1 ? .rightMouseDragged : heldButton == 2 ? .otherMouseDragged : .mouseMoved
        guard let event = CGEvent(mouseEventSource: eventSource, mouseType: type, mouseCursorPosition: point,
            mouseButton: CGMouseButton(rawValue: UInt32(heldButton ?? 0))!) else { throw NativeFailure("INPUT_EVENT_FAILED", "Could not allocate mouse move.") }
        try moved?(point)
        try check(); event.flags = flags(); lastPoint = point; try post(event); pump(0.008)
        if !CGPreflightPostEventAccess() { throw NativeFailure("INPUT_PERMISSION_REQUIRED", "Event posting permission was revoked.", ["permissions": permissions()]) }
    }

    func scroll(_ dx: Int32, _ dy: Int32) throws {
        try check(); try requireInput()
        guard let event = CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0) else { throw NativeFailure("INPUT_EVENT_FAILED", "Could not allocate scroll event.") }
        if background {
            guard let point = lastPoint else { throw NativeFailure("SCROLL_POINT_REQUIRED", "Specify a point in the selected window for background scrolling.") }
            event.location = point
        }
        event.flags = flags(); try post(event); pump(0.015)
        if !CGPreflightPostEventAccess() { throw NativeFailure("INPUT_PERMISSION_REQUIRED", "Event posting permission was revoked.", ["permissions": permissions()]) }
    }

    func typeText(_ text: String) throws {
        try check(); try requireInput()
        if IsSecureEventInputEnabled() {
            throw NativeFailure("SECURE_INPUT_ACTIVE", "macOS Secure Event Input is active; text was not posted.")
        }
        guard keys.isEmpty else { throw NativeFailure("MODIFIER_HELD", "Release held keys before Unicode text input.", held()) }
        let units = Array(text.utf16)
        var index = 0
        while index < units.count {
            try check()
            if units[index] == 10 || units[index] == 13 || units[index] == 9 {
                let code: UInt16 = units[index] == 9 ? 48 : 36
                try key(code, down: true); try key(code, down: false)
                if units[index] == 13 && index + 1 < units.count && units[index + 1] == 10 { index += 1 }
                index += 1; continue
            }
            var end = min(units.count, index + 20)
            if let control = units[index..<end].firstIndex(where: { $0 == 10 || $0 == 13 || $0 == 9 }) { end = control }
            if end < units.count && (0xD800...0xDBFF).contains(units[end - 1]) { end -= 1 }
            let chunk = Array(units[index..<end])
            if !background && CGEventSource.keyState(.combinedSessionState, key: 0) {
                throw NativeFailure("INPUT_ALREADY_HELD", "The user already holds the Unicode event key; it was not acquired.", ["keyCode": 0])
            }
            guard let down = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: true),
                  let up = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: false) else { throw NativeFailure("INPUT_EVENT_FAILED", "Could not allocate Unicode input event.") }
            keys.insert(0); try persist()
            chunk.withUnsafeBufferPointer { ptr in
                down.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: ptr.baseAddress)
                up.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: ptr.baseAddress)
            }
            down.flags = []; up.flags = []
            try post(down, keyboard: true); try post(up, keyboard: true, releasing: true); pump(0.01)
            guard CGPreflightPostEventAccess(), background || !CGEventSource.keyState(.combinedSessionState, key: 0) else {
                throw NativeFailure("INPUT_EVENT_UNCONFIRMED", "Unicode key-up was not confirmed; journal was retained.")
            }
            keys.remove(0)
            do { try persist() } catch { keys.insert(0); throw error }
            index = end
        }
    }

    func release() -> [String: Any] {
        released?()
        var failures: [[String: Any]] = []
        let point = background ? lastPoint ?? .zero : CGEvent(source: nil)?.location ?? .zero
        for buttonCode in buttons.sorted() {
            do { try button(buttonCode, point: point, down: false, releasing: true) }
            catch let error as NativeFailure { failures.append(error.json) }
            catch { failures.append(NativeFailure("INPUT_JOURNAL_FAILED", error.localizedDescription).json) }
        }
        // Release non-modifiers before modifiers to avoid changing a held chord mid-release.
        let modifiers: Set<UInt16> = [54, 55, 56, 58, 59, 60, 61, 62, 63]
        for code in keys.sorted(by: { modifiers.contains($0) == modifiers.contains($1) ? $0 < $1 : !modifiers.contains($0) }) {
            do { try key(code, down: false, releasing: true) }
            catch let error as NativeFailure { failures.append(error.json) }
            catch { failures.append(NativeFailure("INPUT_JOURNAL_FAILED", error.localizedDescription).json) }
        }
        recoveryRequired = !keys.isEmpty || !buttons.isEmpty || !failures.isEmpty
        return ["released": !recoveryRequired, "failures": failures, "heldKeys": keys.sorted().map { Int($0) }, "heldButtons": buttons.sorted()]
    }
}

func keyCode(_ name: String) throws -> UInt16 {
    let codes: [String: UInt16] = ["a":0,"s":1,"d":2,"f":3,"h":4,"g":5,"z":6,"x":7,"c":8,"v":9,"b":11,
        "q":12,"w":13,"e":14,"r":15,"y":16,"t":17,"1":18,"2":19,"3":20,"4":21,"6":22,"5":23,"=":24,"9":25,"7":26,"-":27,"8":28,"0":29,
        "]":30,"o":31,"u":32,"[":33,"i":34,"p":35,"enter":36,"return":36,"l":37,"j":38,"'":39,"k":40,";":41,"\\":42,",":43,"/":44,"n":45,"m":46,".":47,"tab":48,"space":49,"`":50,"backspace":51,"escape":53,"esc":53,
        "meta":55,"command":55,"cmd":55,"shift":56,"alt":58,"option":58,"control":59,"ctrl":59,"fn":63,
        "f17":64,"f5":96,"f6":97,"f7":98,"f3":99,"f8":100,"f9":101,"f11":103,"f13":105,"f16":106,"f14":107,"f10":109,"f12":111,"f15":113,"home":115,"pageup":116,"delete":117,"f4":118,"end":119,"f2":120,"pagedown":121,"f1":122,"left":123,"right":124,"down":125,"up":126]
    let aliases = ["super": "command", "super_l": "command", "meta_l": "command", "control_l": "control", "shift_l": "shift", "alt_l": "alt", "page_down": "pagedown", "page_up": "pageup"]
    let lower = name.lowercased().replacingOccurrences(of: "arrow", with: "")
    let normalized = aliases[lower] ?? lower
    guard let code = codes[normalized] else { throw NativeFailure("UNKNOWN_KEY", "Unsupported key name: \(name). Use keyCode for an explicit macOS virtual key.") }
    return code
}
