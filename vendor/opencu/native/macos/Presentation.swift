import Foundation
import AppKit
import WebKit

final class PresentationPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func cancelOperation(_ sender: Any?) { performClose(sender) }
}

final class PresentationWebView: WKWebView {
    override var mouseDownCanMoveWindow: Bool { true }
    override func rightMouseDown(with event: NSEvent) {
        let menu = NSMenu()
        let item = menu.addItem(withTitle: "Hide preview", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "")
        item.target = window
        NSMenu.popUpContextMenu(menu, with: event, for: self)
    }
}

final class PresentationHost: NSObject, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate {
    let panel: PresentationPanel
    let web: WKWebView
    var ready = false
    var pending: [(Any, String)] = []
    var closing = false
    var hidden = true
    var owner: NSRunningApplication?
    var ownerWindow: Int?
    var ownerBounds: CGRect?
    var followTimer: Timer?
    var offset = NSPoint(x: -24, y: 24)
    var following = false

    func findOwner() -> NSRunningApplication? {
        var pid = getppid()
        while pid > 1 {
            if let app = NSRunningApplication(processIdentifier: pid), app.activationPolicy == .regular { return app }
            var info = proc_bsdinfo()
            guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size)) > 0 else { break }
            pid = pid_t(info.pbi_ppid)
        }
        return nil
    }

    func followOwner() {
        guard !hidden, let owner = owner, !owner.isTerminated, !owner.isHidden,
              let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
            panel.orderOut(nil); return
        }
        let candidates = rows.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(owner.processIdentifier) && ($0[kCGWindowLayer as String] as? Int) == 0 }
        let row = ownerWindow.flatMap { id in candidates.first { ($0[kCGWindowNumber as String] as? Int) == id } } ?? candidates.max { a, b in
            let first = a[kCGWindowBounds as String] as? [String: Double] ?? [:]
            let second = b[kCGWindowBounds as String] as? [String: Double] ?? [:]
            return (first["Width"] ?? 0) * (first["Height"] ?? 0) < (second["Width"] ?? 0) * (second["Height"] ?? 0)
        }
        guard let row = row, let bounds = row[kCGWindowBounds as String] as? [String: Any],
              let x = bounds["X"] as? Double, let y = bounds["Y"] as? Double,
              let width = bounds["Width"] as? Double, let height = bounds["Height"] as? Double else {
            panel.orderOut(nil); return
        }
        ownerWindow = row[kCGWindowNumber as String] as? Int
        let top = NSScreen.screens.first?.frame.maxY ?? 0
        let frame = CGRect(x: x, y: top - y - height, width: width, height: height)
        ownerBounds = frame
        following = true
        panel.setFrameOrigin(NSPoint(x: frame.maxX - panel.frame.width + offset.x, y: frame.minY + offset.y))
        following = false
        if !panel.isVisible { panel.orderFrontRegardless() }
    }

    func windowDidMove(_ notification: Notification) {
        guard !following, let bounds = ownerBounds else { return }
        offset = NSPoint(x: panel.frame.maxX - bounds.maxX, y: panel.frame.minY - bounds.minY)
    }

    init(file: URL) {
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        panel = PresentationPanel(contentRect: NSRect(x: screen.maxX - 370, y: screen.minY + 28, width: 340, height: 270),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        let configuration = WKWebViewConfiguration()
        web = PresentationWebView(frame: .zero, configuration: configuration)
        super.init()
        configuration.userContentController.add(self, name: "opencuPresentation")
        panel.title = "OpenCU Preview"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isMovableByWindowBackground = true
        web.underPageBackgroundColor = .clear
        web.setValue(false, forKey: "drawsBackground")
        owner = findOwner()
        followTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.followOwner() }
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.minSize = NSSize(width: 120, height: 80)
        panel.maxSize = NSSize(width: 640, height: 640)
        panel.delegate = self
        panel.contentView = web
        web.navigationDelegate = self
        web.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        hidden = true
        panel.orderOut(nil)
        writeJSON(["event": ["type": "hidden"]])
        return false
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let value = message.body as? [String: Any] else { return }
        if value["type"] as? String == "error", let message = value["message"] as? String {
            writeJSON(["event": ["type": "error", "message": message]])
            return
        }
        if value["type"] as? String == "rendered" {
            writeJSON(["event": value]); return
        }
        guard value["type"] as? String == "focus", let targetID = value["targetId"] as? String else { return }
        if value["provider"] as? String == "dsh" { owner?.activate(options: []) }
        writeJSON(["event": ["type": "focus", "targetId": targetID]])
        hidden = true
        panel.orderOut(nil)
        writeJSON(["event": ["type": "hidden"]])
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready = true
        let waiting = pending; pending.removeAll()
        for (id, script) in waiting { evaluate(id, script) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel)
    }

    func evaluate(_ id: Any, _ script: String) {
        web.evaluateJavaScript(script) { [weak self] _, error in
            if let error = error { writeJSON(["id": id, "ok": false, "error": NativeFailure("PRESENTATION_RENDER_FAILED", error.localizedDescription).json]) }
            else if let self = self {
                writeJSON(["id": id, "ok": true, "result": ["rendered": true, "visible": self.panel.isVisible,
                    "ownerPid": self.owner.map { Int($0.processIdentifier) } ?? 0, "ownerWindow": self.ownerWindow ?? 0]])
            }
        }
    }

    func command(_ value: [String: Any]) {
        let id = value["id"] ?? -1
        switch value["method"] as? String {
        case "hello": writeJSON(["id": id, "ok": true, "result": ["protocol": 1, "presentation": true, "windowId": panel.windowNumber]])
        case "update":
            do {
                let payload = value["params"] as? [String: Any] ?? [:]
                let data = try JSONSerialization.data(withJSONObject: payload)
                let script = "window.opencuPresentationUpdate(\(String(decoding: data, as: UTF8.self)))"
                if let frames = payload["frames"] as? [[String: Any]], let first = frames.first,
                   let width = first["width"] as? Double, let height = first["height"] as? Double, width > 0, height > 0 {
                    let scale = min(300 / width, 210 / height, 1)
                    let size = NSSize(width: max(120, width * scale) + 32 + Double(max(0, frames.count - 1)) * 28,
                                      height: max(80, height * scale) + 32 + Double(max(0, frames.count - 1)) * 22)
                    following = true; panel.setContentSize(size); following = false
                }
                if ready { evaluate(id, script) } else { pending.append((id, script)) }
                hidden = false
                if owner != nil { followOwner() } else { panel.orderFrontRegardless() }
            } catch { writeJSON(["id": id, "ok": false, "error": NativeFailure("INVALID_PRESENTATION", error.localizedDescription).json]) }
        case "close":
            closing = true; panel.orderOut(nil)
            writeJSON(["id": id, "ok": true, "result": ["released": true]])
            NSApplication.shared.terminate(nil)
        default: writeJSON(["id": id, "ok": false, "error": NativeFailure("UNKNOWN_METHOD", "Unknown presentation operation.").json])
        }
    }
}

func runPresentation(_ file: URL) {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let host = PresentationHost(file: file)
    DispatchQueue.global(qos: .userInitiated).async {
        while let line = readLine() {
            do {
                guard let value = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any] else { continue }
                DispatchQueue.main.async { host.command(value) }
            } catch { writeJSON(["id": -1, "ok": false, "error": NativeFailure("INVALID_REQUEST", "Expected a JSON object.").json]) }
        }
        DispatchQueue.main.async { app.terminate(nil) }
    }
    app.run()
}
