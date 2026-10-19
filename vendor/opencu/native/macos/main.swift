import Foundation
import AppKit
import ApplicationServices
import Darwin

final class CommandQueue: @unchecked Sendable {
    private let condition = NSCondition()
    private var commands: [[String: Any]] = []
    private var ended = false
    let cancellation: Cancellation
    init(_ cancellation: Cancellation) { self.cancellation = cancellation }
    func push(_ command: [String: Any]) {
        var command = command
        if ["release", "close"].contains(command["method"] as? String ?? "") { cancellation.stop() }
        if ["act", "verify", "observe", "preview"].contains(command["method"] as? String ?? "") {
            var params = command["params"] as? [String: Any] ?? [:]
            params["_controlEpoch"] = cancellation.current(); command["params"] = params
        }
        condition.lock(); commands.append(command); condition.signal(); condition.unlock()
    }
    func finish() { cancellation.stop(); condition.lock(); ended = true; condition.signal(); condition.unlock() }
    func next() -> (command: [String: Any]?, ended: Bool) {
        condition.lock(); defer { condition.unlock() }
        if commands.isEmpty && !ended { _ = condition.wait(until: Date(timeIntervalSinceNow: 0.025)) }
        return (commands.isEmpty ? nil : commands.removeFirst(), ended && commands.isEmpty)
    }
}

final class NativeService {
    let targets = TargetStore()
    var ax = AccessibilityStore()
    var capture: CaptureStore
    let input: InputStore
    let cursor = CursorHost()
    let video = VideoStore()
    lazy var activity = ActivityStore(targets: targets)
    var closing = false
    init(directory: URL, cancellation: Cancellation) throws {
        let screenshots = directory.appendingPathComponent("screenshots", isDirectory: true)
        try FileManager.default.createDirectory(at: screenshots, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        capture = CaptureStore(directory: screenshots)
        input = try InputStore(directory: directory, cancellation: cancellation)
        input.moved = { [weak self] point, continuous in try self?.cursor.show(point, continuous: continuous) }
        input.pointerSettled = { [weak self] point in self?.cursor.settled(point) }
        input.released = { [weak self] in self?.cursor.hide() }
    }

    func perform(_ method: String, _ params: [String: Any]) throws -> Any {
        switch method {
        case "hello": return ["protocol": 1, "platform": "darwin", "permissions": permissions(), "input": input.held(), "recoveryRequired": input.recoveryRequired]
        case "configureCursor":
            guard let path = params["path"] as? String else { throw NativeFailure("INVALID_REQUEST", "Cursor resource path is required.") }
            try cursor.configure(path); return ["configured": true]
        case "permissions": return permissions()
        case "openPermissionSettings": return try openPermissionSettings(params["permission"] as? String ?? "accessibility")
        case "requestPermission": return try requestPermission(params["permission"] as? String ?? "accessibility")
        case "revealPermissionHelper": return revealPermissionHelper()
        case "listTargets": return targets.list()
        case "applicationMetadata":
            let target = try targets.validated(params["target"] as? [String: Any] ?? [:])
            let app = try targets.app(target)
            var result: [String: Any] = ["displayName": app.localizedName ?? app.bundleIdentifier ?? ""]
            if let icon = targets.icon(app) { result["iconDataURL"] = icon }
            return result
        case "select", "focus":
            let reference = params["reference"] as? [String: Any] ?? params
            let target = try method == "focus" ? targets.focus(reference) : targets.select(reference)
            activity.watch(target); return target
        case "verify":
            let cancellation = input.cancellation, epoch = params["_controlEpoch"] as? Int ?? cancellation.current()
            return try cancellableRead(cancellation, epoch: epoch) {
                TargetStore().verify(params["target"] as? [String: Any] ?? [:], cold: (params["options"] as? [String: Any])?["cold"] as? Bool ?? false)
            }
        case "preview":
            let cancellation = input.cancellation, epoch = params["_controlEpoch"] as? Int ?? cancellation.current()
            let target = try cancellableRead(cancellation, epoch: epoch) { try TargetStore().validated(params["target"] as? [String: Any] ?? [:]) }
            var frame = try video.preview(target, checkpoint: { try cancellation.check(epoch) })
            if let app = try? targets.app(target), let icon = targets.icon(app) { frame["iconDataURL"] = icon }
            return frame
        case "presentationContrast": return try capture.presentationContrast(params)
        case "stopPreview":
            guard let id = params["targetId"] as? String else { throw NativeFailure("INVALID_REQUEST", "A preview target is required.") }
            video.stop(id); return ["released": true]
        case "observe":
            let cancellation = input.cancellation, epoch = params["_controlEpoch"] as? Int ?? cancellation.current()
            let ax = AccessibilityStore(copying: self.ax), capture = CaptureStore(copying: self.capture)
            var result = try cancellableRead(cancellation, epoch: epoch) { () throws -> [String: Any] in
                let checkpoint = { try cancellation.check(epoch) }
                let targets = TargetStore()
                let target = try targets.validated(params["target"] as? [String: Any] ?? [:])
                try checkpoint()
                let options = params["options"] as? [String: Any] ?? [:]
                let format = options["format"] as? String ?? "both"
                guard ["both", "ax", "screenshot"].contains(format) else { throw NativeFailure("INVALID_OBSERVATION", "format must be both, ax or screenshot.") }
                var result: [String: Any] = ["observationId": UUID().uuidString, "targetId": target["id"] ?? "", "identity": target["identity"] ?? [:],
                    "target": target, "coordinateSpace": "physical-screenshot-pixels", "permissions": permissions(), "observedAt": ISO8601DateFormatter().string(from: Date())]
                // Partial observations carry their actual errors. A completely failed observation throws.
                var failures: [[String: Any]] = []
                if format != "screenshot" {
                    do { let tree = try ax.observe(target, targets: targets, options: options, checkpoint: checkpoint); result["ax"] = tree; result["state"] = tree["text"]; result["text"] = tree["text"] }
                    catch let failure as NativeFailure { if failure.code == "CONTROL_STOPPED" { throw failure }; failures.append(failure.json) }
                }
                try checkpoint()
                if format != "ax" {
                    do { result["screenshot"] = try capture.capture(target, targets: targets, options: options, checkpoint: checkpoint) }
                    catch let failure as NativeFailure { if failure.code == "CONTROL_STOPPED" { throw failure }; failures.append(failure.json) }
                }
                if result["ax"] == nil && result["screenshot"] == nil {
                    if failures.count == 1, let first = failures.first { throw NativeFailure(first["code"] as? String ?? "OBSERVATION_FAILED", first["message"] as? String ?? "Observation failed.", first["details"] as? [String: Any] ?? [:]) }
                    throw NativeFailure("OBSERVATION_FAILED", "Neither AX state nor screenshot could be obtained.", ["failures": failures, "permissions": permissions()])
                }
                if !failures.isEmpty { result["partial"] = true; result["errors"] = failures }
                return result
            }
            try cancellation.check(epoch)
            // Only the main command lane publishes completed read snapshots.
            // An interrupted worker retains private stores until its RPC ends.
            capture.retainFiles(); self.ax = ax; self.capture = capture
            result.merge(activity.snapshot(result["target"] as? [String: Any] ?? [:])) { _, value in value }
            return result
        case "act":
            let action = params["action"] as? [String: Any] ?? [:]
            let inputStart = input.dispatchSequence
            input.actionEpoch = params["_controlEpoch"] as? Int ?? input.cancellation.current()
            input.activePID = nil; input.activeWindow = nil
            defer { input.activePID = nil; input.activeWindow = nil }
            do {
                let target = try targets.validated(params["target"] as? [String: Any] ?? [:])
                return try act(target, action)
            }
            catch let failure as NativeFailure {
                let dispatched = failure.details["inputDispatched"] as? Bool == true || input.dispatchSequence != inputStart
                let clickAction = ["click","double_click","right_click"].contains(action["type"] as? String ?? "")
                let pressAction = action["type"] as? String == "press_key"
                let rejectedPress = pressAction && ["INVALID_ARGUMENT","INVALID_ACTION","UNKNOWN_KEY","INPUT_ALREADY_HELD","RELEASE_REQUIRED","UNSUPPORTED_ACTION"].contains(failure.code)
                if !dispatched, rejectedPress || clickAction && ["INVALID_ARGUMENT","INPUT_ALREADY_HELD","RELEASE_REQUIRED","UNSUPPORTED_ACTION"].contains(failure.code) {
                    throw NativeFailure(failure.code, failure.message, failure.details.merging(["inputDispatched":false,"retryable":false]) { _, value in value })
                }
                let release = input.release()
                var details: [String: Any] = ["release": release]
                if clickAction || pressAction { details["inputDispatched"] = dispatched }
                throw NativeFailure(failure.code, failure.message, failure.details.merging(details) { _, right in right })
            }
            catch { let release = input.release(); throw NativeFailure("NATIVE_ACTION_FAILED", error.localizedDescription, ["release": release]) }
        case "release": return input.release()
        case "close":
            let result = input.release()
            guard result["released"] as? Bool == true else { throw NativeFailure("RELEASE_FAILED", "Input release failed; helper remains alive and its journal is retained.", result) }
            activity.close(); video.close(); closing = true
            return result
        default: throw NativeFailure("UNKNOWN_METHOD", "Unknown native helper method: \(method).")
        }
    }

    func point(_ action: [String: Any], _ target: [String: Any]) throws -> CGPoint {
        if let elementID = action["elementId"] as? Int { return try ax.center(elementID, target: target) }
        return try capture.point(action, target: target)
    }

    func mouseButton(_ action: [String: Any]) throws -> Int {
        if let number = action["button"] as? Int, (0...2).contains(number) { return number }
        switch action["button"] as? String ?? "left" {
        case "left": return 0
        case "right": return 1
        case "middle": return 2
        default: throw NativeFailure("INVALID_ACTION", "button must be left, right or middle.")
        }
    }

    func code(_ action: [String: Any]) throws -> UInt16 {
        if let raw = action["keyCode"] as? Int, raw >= 0 && raw <= 127 { return UInt16(raw) }
        guard let name = action["key"] as? String else { throw NativeFailure("INVALID_ACTION", "A key name or virtual keyCode is required.") }
        return try keyCode(name)
    }

    func act(_ target: [String: Any], _ action: [String: Any]) throws -> [String: Any] {
        if input.keys.isEmpty && input.buttons.isEmpty { try input.route(to: nil) }
        try input.check()
        let type = action["type"] as? String ?? ""
        if type == "activate" { return ["focused": true, "target": try targets.focus(target)] }
        if type == "hit_test" {
            try requireAX()
            return ["element": try ax.hitTest(capture.point(action, target: target), target: target, targets: targets)]
        }
        guard ["set_value", "ax_press", "select_text", "paste", "perform_secondary_action", "move", "click", "double_click", "right_click", "mouse_down", "mouse_up", "drag", "scroll", "key_down", "key_up", "press_key", "type_text"].contains(type) else {
            throw NativeFailure("UNSUPPORTED_ACTION", "Unsupported native action: \(type).")
        }
        let mode = action["inputMode"] as? String ?? "background"
        guard ["background", "foreground"].contains(mode) else { throw NativeFailure("INVALID_ACTION", "inputMode must be background or foreground.") }
        let click = ["click","double_click","right_click"].contains(type) ? try ClickOptions(action, type: type) : nil
        let keyDuration = type == "press_key" ? try pressDuration(action) : 0
        if let click = click { try input.checkClick(click, button: type == "right_click" ? 1 : mouseButton(action)) }
        var rowSelection: AXUIElement?, pressElement: AXUIElement?
        if mode == "background", type == "click", try mouseButton(action) == 0,
            click?.transactional != true, click?.count == 1, input.keys.isEmpty, input.buttons.isEmpty {
            let id: Int?
            if let selected = action["elementId"] as? Int { id = selected }
            else if AXIsProcessTrusted() {
                let at = try capture.point(action, target: target)
                do { id = try ax.hitTest(at, target: target, targets: targets)["elementId"] as? Int }
                catch let failure as NativeFailure where ["ELEMENT_NOT_FOUND", "AX_OPERATION_FAILED", "WINDOW_AX_MAPPING_FAILED"].contains(failure.code) { id = nil }
            } else { id = nil }
            if let id = id {
                pressElement = try ax.pressable(id, target: target, targets: targets)
                if pressElement == nil { rowSelection = try ax.selectableRow(id, target: target, targets: targets) }
            }
        }
        let semantic = ["set_value", "ax_press", "select_text", "paste", "perform_secondary_action"].contains(type) || rowSelection != nil || pressElement != nil
        if !semantic {
            try input.route(to: mode == "background" ? target : nil)
            let application = try targets.app(target)
            if mode == "foreground" {
                guard application.isActive else { throw NativeFailure("TARGET_NOT_ACTIVE", "Explicit foreground input requires focusing the selected application first.") }
                input.activePID = application.processIdentifier
                if target["windowId"] != nil {
                    let window = try targets.axWindow(target)
                    let root = AXUIElementCreateApplication(application.processIdentifier)
                    guard let focused = attribute(root, kAXFocusedWindowAttribute), CFEqual(focused, window) else {
                        throw NativeFailure("TARGET_WINDOW_NOT_ACTIVE", "Explicit foreground input requires focusing the selected window first.")
                    }
                    input.activeWindow = window
                }
            }
        }
        if !semantic && (["move", "click", "double_click", "right_click", "mouse_down", "drag"].contains(type) || type == "scroll" && (action["x"] != nil || action["elementId"] != nil)) {
            try requireInput(); try cursor.prepare(); try input.check()
            cursor.track { [weak self] in self?.targets.visibleWindow(target) }
        }
        switch type {
        case "select_text":
            try input.semanticAction { willDispatch in
                guard let id = action["elementId"] as? Int else { throw NativeFailure("INVALID_ARGUMENT", "selectText requires a numeric elementId from this target's latest AX observation.") }
                try ax.selectText(id, target: target, targets: targets, action: action, check: input.check, willDispatch: willDispatch)
            }
        case "paste":
            try input.semanticAction { willDispatch in
                guard let text = action["text"] as? String,
                      action["elementId"] == nil || action["elementId"] is NSNull || action["elementId"] is Int else {
                    throw NativeFailure("INVALID_ARGUMENT", "paste requires text and an optional numeric elementId (or null for this application's focused editor).")
                }
                let format = action["format"] as? String ?? "text"
                guard action["format"] == nil || action["format"] is String else { throw NativeFailure("INVALID_ARGUMENT", "paste format must be a string.") }
                guard ["text", "md"].contains(format) else { throw NativeFailure("UNSUPPORTED_PASTE_FORMAT", "Native paste supports text and md as literal text; HTML formatting is not supported.") }
                try ax.paste(action["elementId"] as? Int, target: target, targets: targets, text: text, check: input.check, willDispatch: willDispatch)
            }
        case "perform_secondary_action":
            try input.semanticAction { willDispatch in
                guard let id = action["elementId"] as? Int, let name = action["actionName"] as? String, !name.isEmpty else {
                    throw NativeFailure("INVALID_ARGUMENT", "performSecondaryAction requires a numeric elementId and non-empty actionName from the element's observed actions.")
                }
                try ax.performSecondaryAction(id, target: target, targets: targets, name: name, check: input.check, willDispatch: willDispatch)
            }
        case "set_value":
            guard let id = action["elementId"] as? Int, let value = action["value"], value is String || value is NSNumber else { throw NativeFailure("INVALID_ACTION", "AX set_value requires numeric elementId and string/number value.") }
            try ax.setValue(id, target: target, value: value)
        case "ax_press":
            guard let id = action["elementId"] as? Int else { throw NativeFailure("INVALID_ACTION", "ax_press requires numeric elementId.") }
            try ax.press(id, target: target)
        case "move": try input.move(point(action, target))
        case "click", "double_click", "right_click", "mouse_down", "mouse_up":
            if let element = pressElement {
                try input.semanticAction { willDispatch in
                    try input.check(); willDispatch()
                    try checkedAX(AXUIElementPerformAction(element, kAXPressAction as CFString), "press control")
                }
                break
            }
            if let row = rowSelection {
                try input.semanticAction { willDispatch in
                    try input.check(); willDispatch()
                    try checkedAX(AXUIElementSetAttributeValue(row, kAXSelectedAttribute as CFString, kCFBooleanTrue), "select row")
                }
                break
            }
            let at = try point(action, target)
            let button = type == "right_click" ? 1 : try mouseButton(action)
            if type == "mouse_up" { try input.button(button, point: at, down: false) }
            else {
                try input.move(at)
                let count = click?.count ?? 1
                for code in click?.keys ?? [] { try input.key(code, down: true) }
                for index in 1...count {
                    try input.button(button, point: at, down: true, clicks: index)
                    if type != "mouse_down" {
                        try input.holdClick(click?.duration ?? 0)
                        try input.button(button, point: at, down: false, clicks: index)
                    }
                }
                for code in (click?.keys ?? []).reversed() { try input.key(code, down: false) }
            }
        case "drag":
            var from = action
            from["x"] = action["fromX"]; from["y"] = action["fromY"]; from.removeValue(forKey: "elementId")
            let samples = action["path"] as? [[String: Any]] ?? [from, action]
            guard samples.count >= 2 else { throw NativeFailure("INVALID_ACTION", "Drag requires at least two points.") }
            let points = try samples.map { sample -> CGPoint in
                var mapped = action
                mapped.removeValue(forKey: "elementId"); mapped["x"] = sample["x"]; mapped["y"] = sample["y"]
                return try point(mapped, target)
            }
            let start = points[0], end = points[points.count - 1], button = try mouseButton(action)
            let duration = min(10, max(0.05, (action["durationMs"] as? Double ?? 350) / 1000))
            try input.move(start); try input.button(button, point: start, down: true)
            let started = ProcessInfo.processInfo.systemUptime, frameInterval = 1.0 / 60.0
            let deadline = started + duration
            var nextFrame = started + frameInterval
            while true {
                try input.check()
                let now = ProcessInfo.processInfo.systemUptime
                if now >= deadline { break }
                if now < nextFrame {
                    pump(min(nextFrame, deadline) - now)
                    continue
                }
                let position = min(Double(points.count - 1), (now - started) / duration * Double(points.count - 1))
                let index = min(points.count - 2, Int(position)), fraction = position - Double(index)
                let a = points[index], b = points[index + 1]
                try input.move(CGPoint(x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction))
                // Rendering and event-posting time are part of the trajectory.
                // Skip expired frames instead of queuing catch-up input.
                let elapsed = ProcessInfo.processInfo.systemUptime - started
                nextFrame = started + (floor(elapsed / frameInterval) + 1) * frameInterval
            }
            try input.move(end)
            try input.button(button, point: end, down: false)
        case "scroll":
            if action["x"] != nil || action["elementId"] != nil { try input.move(point(action, target)) }
            else if mode == "background" {
                let window = try targets.axWindow(target)
                guard let bounds = axRect(window) else { throw NativeFailure("SCROLL_POINT_REQUIRED", "Specify a screenshot point for background scrolling.") }
                try input.move(CGPoint(x: bounds.midX, y: bounds.midY))
            } else {
                let cursor = CGEvent(source: nil)?.location ?? .zero
                if let bounds = target["bounds"] as? [String: Double], let x = bounds["x"], let y = bounds["y"], let width = bounds["width"], let height = bounds["height"],
                    !CGRect(x: x, y: y, width: width, height: height).contains(cursor) {
                    throw NativeFailure("SCROLL_POINT_REQUIRED", "Cursor is outside the selected window; specify a screenshot point or AX element for scrolling.")
                }
            }
            let dx = try number(action["deltaX"] ?? 0, "deltaX"), dy = try number(action["deltaY"] ?? 0, "deltaY")
            guard abs(dx) <= 100000, abs(dy) <= 100000 else { throw NativeFailure("INVALID_ACTION", "Scroll delta is too large.") }
            // Public deltas follow screen coordinates: positive Y scrolls down.
            try input.scroll(Int32(-dx), Int32(-dy))
        case "key_down": try input.key(code(action), down: true)
        case "key_up": try input.key(code(action), down: false)
        case "press_key":
            let key = action["key"] as? String ?? ""
            var parts: [String] = [], token = ""
            for character in key {
                if character == "+" && !token.isEmpty { parts.append(token); token = "" }
                else { token.append(character) }
            }
            let names = action["keys"] as? [String] ?? (parts + [token])
            let codes: [UInt16]
            if action["keyCode"] != nil { codes = [try code(action)] }
            else {
                var chord: [UInt16] = []
                let shifted = ["!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", "\"": "'", "<": ",", ">": ".", "?": "/", "~": "`"]
                for raw in names {
                    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                    let upperLetter = name.count == 1 && name != name.lowercased() && name == name.uppercased()
                    if upperLetter || shifted[name] != nil, !chord.contains(56) { chord.append(56) }
                    let code = try keyCode(shifted[name] ?? name)
                    if chord.contains(code) && code != 56 { throw NativeFailure("INVALID_ACTION", "A key chord cannot contain duplicate keys.") }
                    if !chord.contains(code) { chord.append(code) }
                }
                codes = chord
            }
            guard !codes.isEmpty && Set(codes).count == codes.count else { throw NativeFailure("INVALID_ACTION", "press_key requires a key or unique key chord.") }
            try input.checkPress(codes)
            for code in codes { try input.key(code, down: true) }
            try input.holdClick(keyDuration)
            for code in codes.reversed() { try input.key(code, down: false) }
        case "type_text":
            guard let text = action["text"] as? String, text.utf16.count <= 100000 else { throw NativeFailure("INVALID_ACTION", "type_text requires text of at most 100000 UTF-16 units.") }
            if let id = action["elementId"] as? Int {
                try requireAX()
                let element = try ax.get(id, target: target)
                if mode == "background" {
                    let root = AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0))
                    guard let focused = attribute(root, kAXFocusedUIElementAttribute), CFEqual(focused, element) else {
                        throw NativeFailure("BACKGROUND_KEYBOARD_UNAVAILABLE", "Use set_value for this element; background typing does not change the application's focused element.")
                    }
                } else { try checkedAX(AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, kCFBooleanTrue), "focus element") }
            }
            try input.typeText(text)
        default: throw NativeFailure("UNSUPPORTED_ACTION", "Unsupported native action: \(type).")
        }
        var result: [String: Any] = ["performed": true, "type": type, "input": input.held(), "inputMode": mode,
            "delivery": semantic ? "accessibility-acknowledged" : mode == "background" ? "process-posted" : "foreground-posted",
            "effectVerified": false]
        if ["select_text", "paste", "perform_secondary_action", "click", "double_click", "right_click", "press_key"].contains(type) { result["inputDispatched"] = true }
        return result
    }
}

do { try ensurePermissionOwner() }
catch {
    writeJSON(["id": 0, "ok": false, "error": (error as? NativeFailure)?.json ?? NativeFailure("PERMISSION_OWNER_UNAVAILABLE", error.localizedDescription).json])
    exit(1)
}
let args = CommandLine.arguments
if args.contains("--permissions") || args.contains("--installation-lock") {
    let installation = args.contains("--installation-lock")
    if installation {
        guard let index = args.firstIndex(of: "--installation-lock"), index + 1 < args.count, args[index + 1].hasPrefix("/") else { exit(1) }
        let path = URL(fileURLWithPath: args[index + 1]).appendingPathComponent("installation.lock").path
        let descriptor = open(path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
        guard descriptor >= 0, flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            writeJSON(["id": 0, "ok": false, "error": NativeFailure("NATIVE_DATA_LOCKED", "Another OpenCU backend owns this helper installation.").json]); exit(1)
        }
    }
    while let line = readLine() {
        do {
            guard let data = line.data(using: .utf8), let command = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw NativeFailure("INVALID_REQUEST", "A JSON request is required.")
            }
            let method = command["method"] as? String ?? ""
            guard ["permissions", "close"].contains(method) || installation && method == "hello" else { throw NativeFailure("UNKNOWN_METHOD", "The permission/installation probe cannot operate applications.") }
            let result: [String: Any] = method == "close" ? ["released": true] : method == "hello" ? ["locked": true] : permissions()
            writeJSON(["id": command["id"] ?? -1, "ok": true, "result": result])
            if method == "close" { break }
        } catch {
            writeJSON(["id": 0, "ok": false, "error": (error as? NativeFailure)?.json ?? NativeFailure("INVALID_REQUEST", error.localizedDescription).json])
        }
    }
    exit(0)
}
if let index = args.firstIndex(of: "--presentation"), index + 1 < args.count {
    runPresentation(URL(fileURLWithPath: args[index + 1]))
    exit(0)
}
if args.contains("--self-test") {
    let map = ScreenshotMapping(bounds: CGRect(x: 100, y: 80, width: 500, height: 400), width: 1000, height: 800, token: "test")
    do {
        let point = try map.point(400, 200)
        guard point == CGPoint(x: 300, y: 180) else { throw NativeFailure("TEST_FAILED", "Physical screenshot mapping failed.") }
        do { _ = try map.point(1000, 0); throw NativeFailure("TEST_FAILED", "Out-of-bounds point accepted.") }
        catch let error as NativeFailure where error.code == "INVALID_COORDINATES" {}
        writeJSON(["ok": true, "checks": ["retina-physical-coordinate-map", "coordinate-bounds"], "permissions": permissions()])
        exit(0)
    } catch { writeJSON(["ok": false, "error": String(describing: error)]); exit(1) }
}

guard let index = args.firstIndex(of: "--data-dir"), index + 1 < args.count, args[index + 1].hasPrefix("/") else {
    writeJSON(["ok": false, "error": NativeFailure("INVALID_DATA_DIR", "Absolute --data-dir is required.").json]); exit(1)
}
let directory = URL(fileURLWithPath: args[index + 1], isDirectory: true)
let lockFD = open(directory.appendingPathComponent("owner.lock").path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else {
    writeJSON(["id": 0, "ok": false, "error": NativeFailure("NATIVE_DATA_LOCKED", "Another native helper owns this data directory.", ["errno": errno]).json]); exit(1)
}
let cancellation = Cancellation()
let queue = CommandQueue(cancellation)
let service: NativeService
do { service = try NativeService(directory: directory, cancellation: cancellation) }
catch { writeJSON(["id": 0, "ok": false, "error": (error as? NativeFailure)?.json ?? NativeFailure("HELPER_START_FAILED", error.localizedDescription).json]); exit(1) }

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        do {
            guard let object = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any], object["id"] is NSNumber, object["method"] is String else { throw NativeFailure("INVALID_REQUEST", "JSON request needs id and method.") }
            queue.push(object)
        } catch { queue.push(["id": -1, "method": "invalidRequest"]) }
    }
    queue.finish()
}

while !service.closing {
    let next = queue.next()
    if let command = next.command {
        let id = command["id"] ?? -1
        do {
            let result = try service.perform(command["method"] as? String ?? "", command["params"] as? [String: Any] ?? [:])
            writeJSON(["id": id, "ok": true, "result": result])
        } catch let failure as NativeFailure { writeJSON(["id": id, "ok": false, "error": failure.json]) }
        catch { writeJSON(["id": id, "ok": false, "error": NativeFailure("NATIVE_FAILURE", error.localizedDescription).json]) }
    } else if next.ended {
        let release = service.input.release()
        if release["released"] as? Bool != true {
            FileHandle.standardError.write(Data("Input release failed at EOF: \(release)\n".utf8)); exit(2)
        }
        break
    }
    pump(0.001)
}
