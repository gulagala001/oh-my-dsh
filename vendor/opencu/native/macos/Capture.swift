import Foundation
import AppKit
import ApplicationServices

struct ScreenshotMapping {
    let bounds: CGRect
    let width: Int
    let height: Int
    let token: String
    var windowId: Int? = nil
    func point(_ x: Double, _ y: Double) throws -> CGPoint {
        guard x >= 0, y >= 0, x < Double(width), y < Double(height) else {
            throw NativeFailure("INVALID_COORDINATES", "Point is outside the latest physical screenshot.", ["x": x, "y": y, "width": width, "height": height])
        }
        return CGPoint(x: bounds.minX + x * bounds.width / Double(width), y: bounds.minY + y * bounds.height / Double(height))
    }
}

final class CaptureStore {
    var mappings: [String: ScreenshotMapping] = [:]
    let directory: URL
    private var temporaryFiles: [URL] = []
    private var discardFiles = false
    init(directory: URL) { self.directory = directory }
    init(copying previous: CaptureStore) {
        directory = previous.directory; mappings = previous.mappings; discardFiles = true
    }
    func retainFiles() { discardFiles = false; temporaryFiles.removeAll() }
    deinit { if discardFiles { for file in temporaryFiles { try? FileManager.default.removeItem(at: file) } } }

    func windowImage(_ target: [String: Any], targets: TargetStore, checkpoint: () throws -> Void = {}) throws -> (CGImage, CGRect) {
        var selected: WindowRecord?
        for attempt in 0..<3 {
            try checkpoint()
            if attempt > 0 { pump(0.08 * Double(attempt)) }
            let current = try targets.validated(target)
            guard let window = targets.windows().first(where: { $0.id == current["windowId"] as? Int && Int($0.pid) == current["pid"] as? Int }) else {
                throw NativeFailure("TARGET_IDENTITY_CHANGED", "Window is no longer available for capture.")
            }
            selected = window
            if let image = CGWindowListCreateImage(.null, .optionIncludingWindow, CGWindowID(window.id), [.boundsIgnoreFraming, .bestResolution]), image.width > 0, image.height > 0 {
                try checkpoint()
                return (image, window.bounds)
            }
        }
        guard let window = selected else { throw NativeFailure("TARGET_IDENTITY_CHANGED", "Window is no longer available for capture.") }
        _ = try targets.validated(target)
        guard CGPreflightScreenCaptureAccess() else {
            throw NativeFailure("SCREEN_CAPTURE_PERMISSION_REQUIRED", "Screen Recording permission is no longer granted. No permission was requested or changed.", ["permissions": permissions()])
        }
        throw NativeFailure("BACKGROUND_CAPTURE_UNAVAILABLE", "macOS returned no image for the selected window after bounded retries. It may still be opening, hidden, minimized or protected. Observe again when it is available; no window was activated and no display fallback was used.",
            ["windowId": window.id, "attempts": 3, "retryable": true, "permissions": permissions()])
    }

    func capture(_ target: [String: Any], targets: TargetStore, options: [String: Any], checkpoint: () throws -> Void = {}) throws -> [String: Any] {
        try checkpoint()
        guard CGPreflightScreenCaptureAccess() else {
            throw NativeFailure("SCREEN_CAPTURE_PERMISSION_REQUIRED", "Screen Recording permission is not granted. No permission was requested or changed.", ["permissions": permissions()])
        }
        let windowID = target["windowId"] as? Int
        let bounds: CGRect
        let image: CGImage
        if options["scope"] as? String == "display" || windowID == nil {
            // Current scope is one display; never claim mixed-display scaling support.
            let display = CGMainDisplayID()
            bounds = CGDisplayBounds(display)
            guard let pixels = CGDisplayCreateImage(display) else {
                throw NativeFailure("SCREEN_CAPTURE_FAILED", "macOS returned no display screenshot.", ["permissions": permissions()])
            }
            image = pixels
        } else {
            (image, bounds) = try windowImage(target, targets: targets, checkpoint: checkpoint)
        }
        try checkpoint()
        let bitmap = NSBitmapImageRep(cgImage: image)
        guard let png = bitmap.representation(using: .png, properties: [:]) else { throw NativeFailure("SCREEN_CAPTURE_FAILED", "Could not encode screenshot as PNG.") }
        let token = UUID().uuidString
        let file = directory.appendingPathComponent("\(token).png")
        try checkpoint()
        if discardFiles { temporaryFiles.append(file) }
        try png.write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        let capturedWindow = windowID != nil && options["scope"] as? String != "display" ? windowID : nil
        let mapping = ScreenshotMapping(bounds: bounds, width: image.width, height: image.height, token: token, windowId: capturedWindow)
        mappings[target["id"] as? String ?? ""] = mapping
        try checkpoint()
        return ["path": file.path, "mimeType": "image/png", "mediaType": "image/png", "width": image.width, "height": image.height,
            "scale": Double(image.width) / bounds.width, "scaleX": Double(image.width) / bounds.width,
            "scaleY": Double(image.height) / bounds.height, "bounds": rectJSON(bounds), "coordinateSpace": "physical-screenshot-pixels",
            "mappingId": token, "scope": windowID == nil || options["scope"] as? String == "display" ? "display" : "window"]
    }

    func preview(_ target: [String: Any], targets: TargetStore) throws -> [String: Any] {
        guard CGPreflightScreenCaptureAccess() else { throw NativeFailure("SCREEN_CAPTURE_PERMISSION_REQUIRED", "Screen Recording permission is required for monitoring.") }
        guard target["windowId"] is Int else { throw NativeFailure("WINDOW_REQUIRED", "Choose a specific application window for monitoring.") }
        let (image, _) = try windowImage(target, targets: targets)
        guard let jpeg = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: 0.65]) else {
            throw NativeFailure("SCREEN_CAPTURE_FAILED", "Could not encode monitor frame.")
        }
        return ["dataUrl": "data:image/jpeg;base64,\(jpeg.base64EncodedString())", "width": image.width, "height": image.height]
    }

    func presentationContrast(_ params: [String: Any]) throws -> [String: Any] {
        guard CGPreflightScreenCaptureAccess() else { return ["available": false, "reason": "screenCapture"] }
        guard let rect = params["rect"] as? [String: Double], let x = rect["x"], let y = rect["y"],
              let width = rect["width"], let height = rect["height"], [x, y, width, height].allSatisfy({ $0.isFinite }),
              width > 0, height > 0, width <= 160, height <= 160, let pid = params["ownerPid"] as? Int,
              let rows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else {
            throw NativeFailure("INVALID_REQUEST", "A bounded monitoring control region is required.")
        }
        let region = CGRect(x: x, y: y, width: width, height: height)
        let owner = rows.first { row in
            guard row[kCGWindowOwnerPID as String] as? Int == pid, row[kCGWindowName as String] as? String == "OpenCU",
                  let value = row[kCGWindowBounds as String] as? [String: Any], let bounds = CGRect(dictionaryRepresentation: value as CFDictionary) else { return false }
            return bounds.contains(region)
        }
        guard let windowID = owner?[kCGWindowNumber as String] as? UInt32 else { return ["available": false, "reason": "monitorHidden"] }
        // Capture below this panel, excluding its controls and the higher cursor overlay.
        guard let image = CGWindowListCreateImage(region, .optionOnScreenBelowWindow, windowID, [.boundsIgnoreFraming, .nominalResolution]) else {
            return ["available": false, "reason": "captureUnavailable"]
        }
        var pixels = [UInt8](repeating: 0, count: 24 * 12 * 4)
        let drawn = pixels.withUnsafeMutableBytes { bytes -> Bool in
            guard let context = CGContext(data: bytes.baseAddress, width: 24, height: 12, bitsPerComponent: 8, bytesPerRow: 96,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.interpolationQuality = .medium; context.draw(image, in: CGRect(x: 0, y: 0, width: 24, height: 12)); return true
        }
        guard drawn else { return ["available": false, "reason": "sampleUnavailable"] }
        var weighted = 0.0, total = 0.0
        for offset in stride(from: 0, to: pixels.count, by: 4) {
            let alpha = Double(pixels[offset + 3]) / 255
            if alpha <= 0.05 { continue }
            let red = min(1, Double(pixels[offset]) / 255 / alpha), green = min(1, Double(pixels[offset + 1]) / 255 / alpha), blue = min(1, Double(pixels[offset + 2]) / 255 / alpha)
            weighted += (red * 0.2126 + green * 0.7152 + blue * 0.0722) * alpha; total += alpha
        }
        return total > 0 ? ["available": true, "luminance": weighted / total] : ["available": false, "reason": "emptySample"]
    }

    func point(_ action: [String: Any], target: [String: Any]) throws -> CGPoint {
        let x = try number(action["x"], "x"), y = try number(action["y"], "y")
        let id = target["id"] as? String ?? ""
        guard let mapping = mappings[id] else { throw NativeFailure("OBSERVATION_REQUIRED", "Observe a screenshot before using coordinates.") }
        if let token = action["mappingId"] as? String, token != mapping.token {
            throw NativeFailure("STALE_SCREENSHOT", "Coordinates refer to a previous screenshot mapping.")
        }
        if mapping.windowId != nil, let windowBounds = target["bounds"] as? [String: Double],
            NSDictionary(dictionary: windowBounds) != NSDictionary(dictionary: rectJSON(mapping.bounds)) {
            throw NativeFailure("STALE_SCREENSHOT", "The window moved or resized. Observe again before using screenshot coordinates.")
        }
        if mapping.windowId == nil, mapping.bounds != CGDisplayBounds(CGMainDisplayID()) {
            throw NativeFailure("STALE_SCREENSHOT", "Display geometry changed. Observe again before using screenshot coordinates.")
        }
        return try mapping.point(x, y)
    }
}
