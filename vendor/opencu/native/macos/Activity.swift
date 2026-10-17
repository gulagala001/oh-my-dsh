import AppKit
import ApplicationServices

/** Observes input only for selected occurrences; never stores keys or changes control ownership. */
final class ActivityStore {
    private let targets: TargetStore
    private let occurrence = UUID().uuidString
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var watched: [String: [String: Any]] = [:]
    private var latest: [String: [String: Any]] = [:]
    private var sequence = 0

    init(targets: TargetStore) { self.targets = targets }
    deinit { close() }

    func watch(_ target: [String: Any]) {
        guard let id = target["id"] as? String else { return }
        if let previous = watched[id], !targets.sameIdentity(previous["identity"] as? [String: Any] ?? [:], target["identity"] as? [String: Any] ?? [:]) {
            latest.removeValue(forKey: id)
        }
        watched[id] = target
        start()
    }

    func snapshot(_ target: [String: Any]) -> [String: Any] {
        watch(target)
        var result: [String: Any] = ["userActivityMonitoring": ["available": tap != nil, "permission": "listenEvents"]]
        if let id = target["id"] as? String, let activity = latest[id] { result["userActivity"] = activity }
        return result
    }

    private func start() {
        guard tap == nil, CGPreflightListenEventAccess() else { return }
        let types: [CGEventType] = [.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown, .flagsChanged, .scrollWheel]
        let mask = types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << $1.rawValue) }
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .tailAppendEventTap, options: .listenOnly,
            eventsOfInterest: mask, callback: { _, type, event, context in
                guard let context = context else { return Unmanaged.passUnretained(event) }
                Unmanaged<ActivityStore>.fromOpaque(context).takeUnretainedValue().receive(type, event)
                return Unmanaged.passUnretained(event)
            }, userInfo: Unmanaged.passUnretained(self).toOpaque()) else { return }
        guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else { CFMachPortInvalidate(tap); return }
        self.tap = tap; self.source = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    private func receive(_ type: CGEventType, _ event: CGEvent) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return
        }
        // Posted input, including OpenCU's own events, is not physical user input.
        guard event.getIntegerValueField(.eventSourceUnixProcessID) == 0 else { return }
        let pointer = [.leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel].contains(type)
        let windows = targets.windows()
        let window = pointer ? windows.first(where: { $0.bounds.contains(event.location) }) : nil
        let pid = window?.pid ?? NSWorkspace.shared.frontmostApplication?.processIdentifier
        guard let pid = pid else { return }
        let focusedBounds = pointer ? nil : attribute(AXUIElementCreateApplication(pid), kAXFocusedWindowAttribute).flatMap { element -> CGRect? in
            guard CFGetTypeID(element) == AXUIElementGetTypeID() else { return nil }
            return axRect(unsafeBitCast(element, to: AXUIElement.self))
        }
        for (id, target) in watched where target["pid"] as? Int == Int(pid) {
            guard targets.verify(target)["valid"] as? Bool == true else { watched.removeValue(forKey: id); latest.removeValue(forKey: id); continue }
            if let windowId = target["windowId"] as? Int {
                if pointer { if window?.id != windowId { continue } }
                else {
                    guard let bounds = focusedBounds, let selected = windows.first(where: { $0.id == windowId }),
                          abs(bounds.minX - selected.bounds.minX) < 2, abs(bounds.minY - selected.bounds.minY) < 2,
                          abs(bounds.width - selected.bounds.width) < 2, abs(bounds.height - selected.bounds.height) < 2 else { continue }
                }
            }
            sequence += 1
            latest[id] = ["documentId": occurrence, "sequence": sequence, "kind": pointer ? (type == .scrollWheel ? "wheel" : "pointerdown") : "keyboard",
                "at": ISO8601DateFormatter().string(from: Date()), "targetId": id]
        }
    }

    func close() {
        if let source = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        if let tap = tap { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
        source = nil; tap = nil; watched.removeAll(); latest.removeAll()
    }
}
