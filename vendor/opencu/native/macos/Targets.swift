import Foundation
import AppKit
import ApplicationServices

struct WindowRecord {
    let id: Int
    let pid: pid_t
    let title: String
    let bounds: CGRect
}

struct NativeCaptureSurface {
    let root: AXUIElement?
    let window: WindowRecord?
    var modalDetection: String { root == nil ? "unavailable" : "accessibility" }
}

func accessibilityCaptureSurface<Surface>(accessibilityAvailable: Bool, cgOnly: () throws -> Surface, accessibility: () throws -> Surface) throws -> Surface {
    // Lack of AX permission does not revoke independent read-only CG capture.
    // A failed read with permission granted must never take this fallback.
    try accessibilityAvailable ? accessibility() : cgOnly()
}

func sameCaptureRoot(_ left: AXUIElement?, _ right: AXUIElement?) -> Bool {
    if let left = left, let right = right { return CFEqual(left, right) }
    return left == nil && right == nil
}

func accessibilityCaptureWindow(_ bounds: CGRect, pid: pid_t, candidates: [WindowRecord]) throws -> WindowRecord {
    let matches = candidates.filter { candidate in
        candidate.pid == pid && abs(candidate.bounds.minX - bounds.minX) < 2 && abs(candidate.bounds.minY - bounds.minY) < 2 &&
            abs(candidate.bounds.width - bounds.width) < 2 && abs(candidate.bounds.height - bounds.height) < 2
    }
    guard !bounds.isNull, !bounds.isInfinite, bounds.width > 0, bounds.height > 0, matches.count == 1 else {
        throw NativeFailure("MODAL_CAPTURE_UNAVAILABLE", "Could not uniquely map the active dialog to its application's capture window; no other window or display was captured.", ["matches": matches.count])
    }
    return matches[0]
}

func accessibilityContains<Node>(_ root: Node, _ element: Node, parent: (Node) -> Node?, equal: (Node, Node) -> Bool) -> Bool {
    var node = element
    for _ in 0..<80 {
        if equal(root, node) { return true }
        guard let next = parent(node) else { return false }
        node = next
    }
    return false
}

func accessibilityActiveSheet<Node>(_ window: Node, children: (Node) throws -> [Node], isSheet: (Node) throws -> Bool,
    contains: (Node, Node) -> Bool, focused: Node?) throws -> Node? {
    var root = window, result: Node?
    for _ in 0..<80 {
        let sheets = try children(root).filter(isSheet)
        if sheets.isEmpty { return result }
        let active = focused.map { focus in sheets.filter { contains($0, focus) } } ?? []
        guard let next = active.count == 1 ? active.first : sheets.count == 1 ? sheets.first : nil else {
            throw NativeFailure("MODAL_STATE_UNAVAILABLE", "Multiple attached sheets are exposed without a unique active sheet; no input was sent.", ["inputDispatched": false, "retryable": false])
        }
        result = next; root = next
    }
    throw NativeFailure("MODAL_STATE_UNAVAILABLE", "The active sheet hierarchy exceeds the supported traversal bound; no input was sent.", ["inputDispatched": false, "retryable": false])
}

final class TargetStore {
    private var icons: [String: String] = [:]

    func axElement(_ element: AXUIElement, _ name: String) -> AXUIElement? {
        guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return unsafeBitCast(value, to: AXUIElement.self)
    }

    func contains(_ root: AXUIElement, _ element: AXUIElement) -> Bool {
        accessibilityContains(root, element, parent: { axElement($0, kAXParentAttribute) }, equal: { CFEqual($0, $1) })
    }

    private func modalAttribute(_ element: AXUIElement, _ name: String, optional: Bool = false) throws -> CFTypeRef? {
        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, name as CFString, &value)
        if optional && [.noValue, .attributeUnsupported].contains(result) { return nil }
        guard result == .success, value != nil else {
            throw NativeFailure("MODAL_STATE_UNAVAILABLE", "Could not verify the current modal boundary; no input was sent.",
                ["inputDispatched": false, "retryable": false, "attribute": name, "axError": result.rawValue])
        }
        return value
    }

    private func modalElements(_ element: AXUIElement, _ name: String) throws -> [AXUIElement] {
        guard let elements = try modalAttribute(element, name) as? [AXUIElement] else {
            throw NativeFailure("MODAL_STATE_UNAVAILABLE", "The modal hierarchy is not a valid AX element list; no input was sent.", ["inputDispatched": false, "retryable": false, "attribute": name])
        }
        return elements
    }

    private func modalRole(_ element: AXUIElement) throws -> String {
        guard let role = try modalAttribute(element, kAXRoleAttribute) as? String else {
            throw NativeFailure("MODAL_STATE_UNAVAILABLE", "The modal hierarchy has an invalid role; no input was sent.", ["inputDispatched": false, "retryable": false])
        }
        return role
    }

    private func owningWindow(_ element: AXUIElement) throws -> AXUIElement? {
        if let value = try modalAttribute(element, kAXWindowAttribute, optional: true), CFGetTypeID(value) == AXUIElementGetTypeID() { return unsafeBitCast(value, to: AXUIElement.self) }
        var node = element
        for _ in 0..<80 {
            if try modalRole(node) == kAXWindowRole { return node }
            guard let value = try modalAttribute(node, kAXParentAttribute, optional: true), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
            node = unsafeBitCast(value, to: AXUIElement.self)
        }
        return nil
    }

    private func modalBlocked() -> NativeFailure {
        NativeFailure("MODAL_BLOCKED", "An active sheet or modal dialog blocks this control/input. Observe and handle the dialog in its owning target first; no input was sent.", ["inputDispatched": false, "retryable": false])
    }

    // Sheets block only their owner window. A standalone AXModal window is
    // application-modal; never reinterpret it as part of a different target.
    func modalRoot(_ target: [String: Any], window: AXUIElement?) throws -> AXUIElement? {
        try requireAX()
        let appRoot = AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0))
        let focused = axElement(appRoot, kAXFocusedUIElementAttribute) ?? axElement(appRoot, kAXFocusedWindowAttribute)
        let modals = try modalElements(appRoot, kAXWindowsAttribute).filter { candidate in
            guard try modalRole(candidate) == kAXWindowRole else { return false }
            guard let modal = try modalAttribute(candidate, kAXModalAttribute) as? NSNumber else {
                throw NativeFailure("MODAL_STATE_UNAVAILABLE", "A window's AXModal flag is unavailable; no input was sent.", ["inputDispatched": false, "retryable": false])
            }
            guard modal.boolValue else { return false }
            // AXWindow on a sheet is its document owner, not the sheet itself.
            if let owner = try modalAttribute(candidate, kAXWindowAttribute, optional: true), CFGetTypeID(owner) == AXUIElementGetTypeID(), !CFEqual(owner, candidate) { return false }
            return true
        }
        let appModal: AXUIElement?
        if modals.count > 1 {
            let active = focused.map { focus in modals.filter { contains($0, focus) } } ?? []
            guard active.count == 1 else { throw NativeFailure("MODAL_STATE_UNAVAILABLE", "The application's active modal window is ambiguous; no input was sent.", ["inputDispatched": false, "retryable": false]) }
            appModal = active[0]
        } else { appModal = modals.first }
        if let modal = appModal, let window = window, !contains(modal, window) { throw modalBlocked() }
        guard let scope = appModal ?? window else { return nil }
        return try accessibilityActiveSheet(scope, children: { try modalElements($0, kAXChildrenAttribute) },
            isSheet: { try modalRole($0) == kAXSheetRole }, contains: contains, focused: focused) ?? appModal
    }

    func observationRoot(_ target: [String: Any]) throws -> AXUIElement {
        let appRoot = AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0))
        let window = try axWindow(target)
        if let modal = try modalRoot(target, window: axString(window, kAXRoleAttribute) == kAXApplicationRole ? nil : window) { return modal }
        return target["windowId"] == nil ? appRoot : window
    }

    func captureSurface(_ target: [String: Any]) throws -> NativeCaptureSurface {
        let current = try validated(target)
        return try accessibilityCaptureSurface(accessibilityAvailable: AXIsProcessTrusted(), cgOnly: {
            if let id = current["windowId"] as? Int {
                guard let selected = window(id), Int(selected.pid) == current["pid"] as? Int else {
                    throw NativeFailure("TARGET_IDENTITY_CHANGED", "The selected capture window no longer exists.")
                }
                return NativeCaptureSurface(root: nil, window: selected)
            }
            return NativeCaptureSurface(root: nil, window: nil)
        }, accessibility: {
            let root = try observationRoot(current), role = try modalRole(root)
            if role == kAXApplicationRole { return NativeCaptureSurface(root: root, window: nil) }
            if role == kAXWindowRole, let id = current["windowId"] as? Int,
               let selected = window(id), Int(selected.pid) == current["pid"] as? Int {
                return NativeCaptureSurface(root: root, window: selected)
            }
            guard let bounds = axRect(root) else {
                throw NativeFailure("MODAL_CAPTURE_UNAVAILABLE", "The active dialog has no verifiable capture bounds; no other window or display was captured.")
            }
            return NativeCaptureSurface(root: root, window: try accessibilityCaptureWindow(bounds, pid: pid_t(current["pid"] as? Int ?? 0), candidates: windows()))
        })
    }

    func requireInteraction(_ element: AXUIElement, target: [String: Any]) throws {
        let window = try target["windowId"] != nil ? axWindow(target) : owningWindow(element) ?? axElement(AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0)), kAXFocusedWindowAttribute)
        if let modal = try modalRoot(target, window: window), !contains(modal, element) { throw modalBlocked() }
    }

    func requireEventInteraction(_ target: [String: Any], point: CGPoint?, keyboard: Bool, windowBound: Bool = false) throws {
        try requireAX()
        let appRoot = AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0))
        var hit: AXUIElement?
        if let point = point { _ = AXUIElementCopyElementAtPosition(appRoot, Float(point.x), Float(point.y), &hit) }
        let focus = axElement(appRoot, kAXFocusedUIElementAttribute) ?? axElement(appRoot, kAXFocusedWindowAttribute)
        let window = try target["windowId"] != nil ? axWindow(target) : (keyboard ? focus : hit).flatMap(owningWindow) ?? axElement(appRoot, kAXFocusedWindowAttribute)
        guard let modal = try modalRoot(target, window: window) else { return }
        if keyboard {
            guard let focus = focus, contains(modal, focus) else { throw modalBlocked() }
        } else {
            guard let point = point, let bounds = axRect(modal), bounds.contains(point), let hit = hit, contains(modal, hit) else { throw modalBlocked() }
            if windowBound, let window = window, !CFEqual(modal, window) {
                // The durable pointer route belongs to the selected CG window.
                // Never post into its blocked content or silently move held input
                // to a sheet's separate window. AX buttons remain available.
                throw NativeFailure("MODAL_POINTER_UNAVAILABLE", "The active sheet has a separate pointer window. Use its observed AX controls, or explicitly focus and use foreground input; no pointer input was sent.", ["inputDispatched": false, "retryable": false])
            }
        }
    }

    func icon(_ app: NSRunningApplication) -> String? {
        guard let path = app.bundleURL?.path else { return nil }
        if let cached = icons[path] { return cached }
        let image = NSWorkspace.shared.icon(forFile: path)
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 72, pixelsHigh: 72,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
            bytesPerRow: 0, bitsPerPixel: 0), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        image.draw(in: NSRect(x: 0, y: 0, width: 72, height: 72), from: .zero, operation: .copy, fraction: 1)
        NSGraphicsContext.restoreGraphicsState()
        guard let data = bitmap.representation(using: .png, properties: [:]) else { return nil }
        let value = "data:image/png;base64," + data.base64EncodedString()
        icons[path] = value
        return value
    }

    func windows() -> [WindowRecord] {
        guard let rows = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        return rows.compactMap(windowRecord)
    }

    private func windowRecord(_ row: [String: Any]) -> WindowRecord? {
            guard let pid = row[kCGWindowOwnerPID as String] as? Int,
                  let id = row[kCGWindowNumber as String] as? Int,
                  let layer = row[kCGWindowLayer as String] as? Int, layer == 0,
                  (row[kCGWindowAlpha as String] as? Double ?? 1) > 0,
                  let b = row[kCGWindowBounds as String] as? [String: Any],
                  let x = b["X"] as? Double, let y = b["Y"] as? Double,
                  let w = b["Width"] as? Double, let h = b["Height"] as? Double, w > 0, h > 24 else { return nil }
            return WindowRecord(id: id, pid: pid_t(pid), title: row[kCGWindowName as String] as? String ?? "", bounds: CGRect(x: x, y: y, width: w, height: h))
    }

    private func window(_ id: Int) -> WindowRecord? {
        guard id > 0, id <= Int(UInt32.max),
              let rows = CGWindowListCopyWindowInfo(.optionIncludingWindow, CGWindowID(id)) as? [[String: Any]],
              rows.count == 1, let record = windowRecord(rows[0]), record.id == id else { return nil }
        return record
    }

    func target(_ app: NSRunningApplication, _ window: WindowRecord? = nil) throws -> [String: Any] {
        var info = proc_bsdinfo()
        let size = Int32(MemoryLayout<proc_bsdinfo>.size)
        guard proc_pidinfo(app.processIdentifier, PROC_PIDTBSDINFO, 0, &info, size) == size,
              let executable = app.executableURL?.path else {
            throw NativeFailure("TARGET_IDENTITY_UNAVAILABLE", "The application has no verifiable process occurrence.", ["pid": app.processIdentifier])
        }
        let bundle = app.bundleIdentifier ?? ""
        let startTime = "\(info.pbi_start_tvsec):\(info.pbi_start_tvusec)"
        var identity: [String: Any] = ["pid": Int(app.processIdentifier), "bundleId": bundle,
            "processStart": startTime, "executable": executable]
        if let window = window { identity["windowId"] = window.id }
        let id = "native:\(app.processIdentifier):" + (window.map { "window:\($0.id)" } ?? "app")
        var result: [String: Any] = ["id": id, "kind": "app", "backend": "native", "platform": "darwin",
            "targetType": window == nil ? "application" : "window", "pid": Int(app.processIdentifier),
            "bundleId": bundle, "name": app.localizedName ?? bundle, "title": window?.title ?? app.localizedName ?? bundle,
            "identity": identity, "active": app.isActive, "hidden": app.isHidden]
        if let window = window {
            result["windowId"] = window.id; result["bounds"] = rectJSON(window.bounds)
        }
        return result
    }

    func list() -> [[String: Any]] {
        let allWindows = windows()
        var targets: [[String: Any]] = []
        for app in NSWorkspace.shared.runningApplications where !app.isTerminated && app.activationPolicy == .regular {
            if let value = try? target(app) { targets.append(value) }
            for window in allWindows where window.pid == app.processIdentifier {
                if let value = try? target(app, window) { targets.append(value) }
            }
        }
        return targets
    }

    func resolve(_ reference: [String: Any]) throws -> [String: Any] {
        // A bound occurrence needs only its own process and window. Discovery still
        // enumerates all targets; observation/input/preview never reuse cached identity.
        if let identity = reference["identity"] as? [String: Any],
           let id = reference["id"] as? String, let pid = identity["pid"] as? Int,
           pid > 1, pid <= Int(Int32.max), identity["processStart"] is String,
           identity["bundleId"] is String, identity["executable"] is String {
            guard let app = NSRunningApplication(processIdentifier: pid_t(pid)),
                  !app.isTerminated, app.activationPolicy == .regular else {
                throw NativeFailure("TARGET_IDENTITY_CHANGED", "The saved application/window occurrence no longer exists.")
            }
            let current: [String: Any]
            if let windowID = identity["windowId"] as? Int {
                guard let record = window(windowID), record.pid == app.processIdentifier else {
                    throw NativeFailure("TARGET_IDENTITY_CHANGED", "The saved application/window occurrence no longer exists.")
                }
                current = try target(app, record)
            } else { current = try target(app) }
            guard current["id"] as? String == id,
                  sameIdentity(identity, current["identity"] as? [String: Any] ?? [:]) else {
                throw NativeFailure("TARGET_IDENTITY_CHANGED", "The saved application/window occurrence no longer exists.")
            }
            return current
        }
        let values = list().filter { value in
            if let id = reference["id"] as? String { return value["id"] as? String == id }
            if let pid = reference["pid"] as? Int, value["pid"] as? Int != pid { return false }
            if let bundle = reference["bundleId"] as? String, value["bundleId"] as? String != bundle { return false }
            if let window = reference["windowId"] as? Int { return value["windowId"] as? Int == window }
            return value["targetType"] as? String == "application" && (reference["pid"] != nil || reference["bundleId"] != nil)
        }
        guard values.count == 1 else {
            throw NativeFailure(values.isEmpty ? "TARGET_NOT_FOUND" : "AMBIGUOUS_TARGET", "Reference must identify exactly one running application or window.", ["matches": values.compactMap { $0["id"] }])
        }
        let result = values[0]
        if let identity = reference["identity"] as? [String: Any], !sameIdentity(identity, result["identity"] as? [String: Any] ?? [:]) {
            throw NativeFailure("TARGET_IDENTITY_CHANGED", "The saved application/window occurrence no longer exists.")
        }
        return result
    }

    func sameIdentity(_ a: [String: Any], _ b: [String: Any]) -> Bool { NSDictionary(dictionary: a).isEqual(to: b) }

    func app(_ target: [String: Any]) throws -> NSRunningApplication {
        guard let identity = target["identity"] as? [String: Any], let pid = identity["pid"] as? Int,
              let app = NSRunningApplication(processIdentifier: pid_t(pid)), !app.isTerminated else {
            throw NativeFailure("TARGET_IDENTITY_CHANGED", "The selected process is no longer running.")
        }
        return app
    }

    func verify(_ saved: [String: Any], cold: Bool = false) -> [String: Any] {
        do {
            guard let identity = saved["identity"] as? [String: Any], identity["processStart"] is String,
                identity["bundleId"] is String, identity["pid"] is Int else {
                throw NativeFailure("TARGET_IDENTITY_REQUIRED", "Verification requires a saved PID/process-start/bundle/window occurrence, not a bare target ID.")
            }
            let current = try resolve(saved)
            if cold, let expectedTitle = saved["title"] as? String, current["title"] as? String != expectedTitle {
                return ["valid": false, "reason": "Window/application title changed during cold recovery."]
            }
            return ["valid": true, "target": current]
        } catch let error as NativeFailure { return ["valid": false, "reason": error.message, "error": error.json] }
        catch { return ["valid": false, "reason": String(describing: error)] }
    }

    func validated(_ saved: [String: Any]) throws -> [String: Any] {
        guard saved["identity"] is [String: Any] else { throw NativeFailure("TARGET_IDENTITY_REQUIRED", "Observe/act requires a selected target with its occurrence identity.") }
        return try resolve(saved)
    }

    func visibleWindow(_ saved: [String: Any]) -> WindowRecord? {
        guard let current = try? validated(saved), let running = try? app(current), !running.isHidden,
              let windowID = current["windowId"] as? Int,
              let rows = CGWindowListCopyWindowInfo(.optionIncludingWindow, CGWindowID(windowID)) as? [[String: Any]],
              let row = rows.first, row[kCGWindowIsOnscreen as String] as? Bool == true,
              let record = windowRecord(row), record.id == windowID, record.pid == running.processIdentifier else { return nil }
        return record
    }

    func launch(_ reference: [String: Any]) throws -> [String: Any] {
        let url: URL
        if let bundle = reference["bundleId"] as? String, let found = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) { url = found }
        else if let path = reference["path"] as? String, path.hasPrefix("/"), path.hasSuffix(".app") { url = URL(fileURLWithPath: path) }
        else { throw NativeFailure("APPLICATION_NOT_FOUND", "Specify an installed bundleId or absolute .app path.") }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = false
        var finished = false, launched: NSRunningApplication?, failure: Error?
        NSWorkspace.shared.openApplication(at: url, configuration: configuration) { app, error in
            launched = app; failure = error; finished = true
        }
        let deadline = Date(timeIntervalSinceNow: 15)
        while !finished && Date() < deadline { pump(0.02) }
        guard finished else { throw NativeFailure("LAUNCH_TIMEOUT", "Application launch timed out; launch outcome is unknown.") }
        if let failure = failure { throw NativeFailure("LAUNCH_FAILED", failure.localizedDescription) }
        guard let app = launched else { throw NativeFailure("LAUNCH_FAILED", "Application did not return a running process.") }
        return try target(app)
    }

    func select(_ reference: [String: Any]) throws -> [String: Any] {
        var selected: [String: Any]
        if reference["identity"] != nil && reference["launch"] as? Bool == true {
            throw NativeFailure("INVALID_TARGET", "Launching cannot replace a saved target occurrence; launch a fresh reference explicitly.")
        }
        if reference["launch"] as? Bool == true, reference["identity"] == nil { selected = try launch(reference) }
        else { selected = try resolve(reference) }
        if let expected = reference["expected"] as? [String: Any] {
            for key in ["title", "bundleId", "pid", "windowId"] {
                if let value = expected[key], let actual = selected[key], !NSDictionary(dictionary: ["value": value]).isEqual(to: ["value": actual]) {
                    throw NativeFailure("TARGET_IDENTITY_CHANGED", "Target \(key) differs from expected reference.", ["expected": value, "actual": actual])
                }
            }
        }
        return selected
    }

    func focus(_ reference: [String: Any]) throws -> [String: Any] {
        var selected = try select(reference)
        let running = try app(selected)
        if selected["windowId"] != nil {
            try requireAX()
            let window = try axWindow(selected)
            try checkedAX(AXUIElementPerformAction(window, kAXRaiseAction as CFString), "raise window")
        }
        guard running.activate(options: []) else {
            throw NativeFailure("ACTIVATION_FAILED", "The selected application could not be activated.")
        }
        pump(0.12)
        selected = try resolve(selected)
        guard running.isActive else { throw NativeFailure("ACTIVATION_FAILED", "The selected application did not become active.") }
        if selected["windowId"] != nil {
            let window = try axWindow(selected), root = AXUIElementCreateApplication(running.processIdentifier)
            guard let focused = axElement(root, kAXFocusedWindowAttribute), contains(window, focused) else {
                throw NativeFailure("TARGET_WINDOW_NOT_ACTIVE", "macOS did not focus the selected window; no input was posted.")
            }
        }
        return selected
    }

    func axWindow(_ target: [String: Any]) throws -> AXUIElement {
        try requireAX()
        let running = try app(target), root = AXUIElementCreateApplication(running.processIdentifier)
        if let id = target["windowId"] as? Int {
            guard let cg = window(id), cg.pid == running.processIdentifier else {
                throw NativeFailure("TARGET_IDENTITY_CHANGED", "Selected window no longer exists.")
            }
            let candidates = axElements(root, kAXWindowsAttribute).filter { element in
                guard let rect = axRect(element) else { return false }
                return abs(rect.minX - cg.bounds.minX) < 2 && abs(rect.minY - cg.bounds.minY) < 2 &&
                    abs(rect.width - cg.bounds.width) < 2 && abs(rect.height - cg.bounds.height) < 2 &&
                    (cg.title.isEmpty || axString(element, kAXTitleAttribute) == cg.title)
            }
            guard candidates.count == 1 else {
                throw NativeFailure("WINDOW_AX_MAPPING_FAILED", "Could not uniquely map the public CG window identity to an AX window.", ["windowId": id, "matches": candidates.count])
            }
            return candidates[0]
        }
        if let focused = attribute(root, kAXFocusedWindowAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() { return unsafeBitCast(focused, to: AXUIElement.self) }
        return root
    }
}
