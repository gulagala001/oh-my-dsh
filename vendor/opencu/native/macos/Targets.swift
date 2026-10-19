import Foundation
import AppKit
import ApplicationServices

struct WindowRecord {
    let id: Int
    let pid: pid_t
    let title: String
    let bounds: CGRect
}

final class TargetStore {
    private var icons: [String: String] = [:]

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
            guard let focused = attribute(root, kAXFocusedWindowAttribute), CFEqual(focused, window) else {
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
