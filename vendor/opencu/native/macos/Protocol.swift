import Foundation
import AppKit
import ApplicationServices

struct NativeFailure: Error {
    let code: String
    let message: String
    let details: [String: Any]
    init(_ code: String, _ message: String, _ details: [String: Any] = [:]) {
        self.code = code; self.message = message; self.details = details
    }
    var json: [String: Any] { ["code": code, "message": message, "details": details] }
}

let permissionSettings = ["accessibility": "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "screenCapture": "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    "postEvents": "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "listenEvents": "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"]

func permissionHelperURL() -> URL {
    let executable = URL(fileURLWithPath: Bundle.main.executablePath ?? CommandLine.arguments[0]).resolvingSymlinksInPath()
    let bundle = executable.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    return bundle.pathExtension == "app" ? bundle : executable
}

func permissions() -> [String: Any] {
    ["accessibility": AXIsProcessTrusted(), "screenCapture": CGPreflightScreenCaptureAccess(),
     "postEvents": CGPreflightPostEventAccess(), "listenEvents": CGPreflightListenEventAccess(), "prompted": false,
     "helperPath": Bundle.main.executablePath ?? CommandLine.arguments[0], "helperBundlePath": permissionHelperURL().path,
     "helperName": "OpenCU Helper", "permissionOwner": "helper", "permissionOwnerPID": Int(getpid()),
     "settings": permissionSettings]
}

func requestPermission(_ name: String) throws -> [String: Any] {
    guard permissionSettings[name] != nil else {
        throw NativeFailure("INVALID_PERMISSION", "Use accessibility, screenCapture, postEvents or listenEvents.")
    }
    NSApplication.shared.setActivationPolicy(.accessory)
    switch name {
    case "accessibility", "postEvents":
        if !AXIsProcessTrusted() {
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(options)
        }
        if !CGPreflightPostEventAccess() { _ = CGRequestPostEventAccess() }
    case "screenCapture":
        if !CGPreflightScreenCaptureAccess() { _ = CGRequestScreenCaptureAccess() }
    case "listenEvents":
        if !CGPreflightListenEventAccess() { _ = CGRequestListenEventAccess() }
    default: break
    }
    let status = permissions()
    let granted = name == "accessibility" || name == "postEvents"
        ? status["accessibility"] as? Bool == true && status["postEvents"] as? Bool == true
        : status[name] as? Bool == true
    var result: [String: Any] = ["requested": true, "permission": name, "granted": granted, "opened": false, "permissions": status]
    if !granted {
        let opened = try openPermissionSettings(name)
        result["opened"] = opened["opened"]; result["url"] = opened["url"]
    }
    return result
}

func revealPermissionHelper() -> [String: Any] {
    let url = permissionHelperURL()
    NSWorkspace.shared.activateFileViewerSelecting([url])
    return ["revealed": true, "path": url.path]
}

func openPermissionSettings(_ name: String) throws -> [String: Any] {
    guard let address = permissionSettings[name], let url = URL(string: address) else {
        throw NativeFailure("INVALID_PERMISSION", "Use accessibility, screenCapture, postEvents or listenEvents.")
    }
    guard NSWorkspace.shared.open(url) else { throw NativeFailure("SETTINGS_OPEN_FAILED", "macOS could not open the permission settings pane.") }
    return ["opened": true, "permission": name, "url": address, "permissions": permissions()]
}

func requireAX() throws {
    if !AXIsProcessTrusted() {
        throw NativeFailure("ACCESSIBILITY_PERMISSION_REQUIRED", "Accessibility permission is not granted to the native helper. No permission was requested or changed.", ["permissions": permissions()])
    }
}

func requireInput() throws {
    if !CGPreflightPostEventAccess() {
        throw NativeFailure("INPUT_PERMISSION_REQUIRED", "macOS denied event posting. No permission was requested or changed.", ["permissions": permissions()])
    }
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}

func axString(_ element: AXUIElement, _ name: String) -> String? { attribute(element, name) as? String }
func axElements(_ element: AXUIElement, _ name: String) -> [AXUIElement] { attribute(element, name) as? [AXUIElement] ?? [] }

func axRect(_ element: AXUIElement) -> CGRect? {
    guard let p = attribute(element, kAXPositionAttribute), let s = attribute(element, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, size = CGSize.zero
    guard AXValueGetValue(unsafeBitCast(p, to: AXValue.self), .cgPoint, &point),
          AXValueGetValue(unsafeBitCast(s, to: AXValue.self), .cgSize, &size) else { return nil }
    return CGRect(origin: point, size: size)
}

func rectJSON(_ rect: CGRect) -> [String: Double] {
    ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]
}

func number(_ value: Any?, _ name: String) throws -> Double {
    guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.isFinite else {
        throw NativeFailure("INVALID_ACTION", "\(name) must be a finite number.")
    }
    return value.doubleValue
}

func checkedAX(_ result: AXError, _ operation: String) throws {
    if result != .success {
        let code = result == .apiDisabled ? "ACCESSIBILITY_PERMISSION_REQUIRED" : "AX_OPERATION_FAILED"
        throw NativeFailure(code, "Accessibility operation failed: \(operation).", ["axError": result.rawValue, "operation": operation, "permissions": permissions()])
    }
}

func pump(_ seconds: Double) { RunLoop.current.run(until: Date(timeIntervalSinceNow: seconds)) }

func writeJSON(_ value: [String: Any]) {
    do {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
    } catch {
        FileHandle.standardError.write(Data("JSON serialization failed: \(error)\n".utf8))
    }
}
