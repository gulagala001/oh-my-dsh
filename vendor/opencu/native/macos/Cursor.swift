import AppKit
import WebKit

final class CursorPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/** A click-through surface for the original REA cursor, never an input owner. */
final class CursorHost: NSObject, WKNavigationDelegate {
    private var panel: CursorPanel?
    private var web: WKWebView?
    private var ready = false
    private var error: Error?
    private var file: URL?
    private var generation = 0
    private var targetIsValid: (() -> Bool)?
    private var lifetimeTimer: Timer?
    private var hideTimer: Timer?
    private var hiding = false

    func track(_ isValid: @escaping () -> Bool) {
        targetIsValid = isValid
    }

    func configure(_ path: String) throws {
        let url = URL(fileURLWithPath: path)
        guard path.hasPrefix("/"), FileManager.default.fileExists(atPath: path) else {
            throw NativeFailure("CURSOR_RESOURCE_MISSING", "The packaged REA cursor resource is unavailable.")
        }
        file = url
    }

    func prepare() throws {
        if ready { return }
        guard let file = file else { throw NativeFailure("CURSOR_RESOURCE_MISSING", "The native cursor has not been configured.") }
        if web == nil {
            NSApplication.shared.setActivationPolicy(.accessory)
            let panel = CursorPanel(contentRect: NSRect(x: 0, y: 0, width: 256, height: 192),
                styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = false
            panel.ignoresMouseEvents = true; panel.isReleasedWhenClosed = false
            panel.level = .statusBar; panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.sharingType = .none
            let web = WKWebView(frame: panel.contentView?.bounds ?? .zero)
            web.autoresizingMask = [.width, .height]
            web.setValue(false, forKey: "drawsBackground"); web.underPageBackgroundColor = .clear
            web.navigationDelegate = self; panel.contentView = web
            self.panel = panel; self.web = web
            web.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
        }
        let deadline = Date(timeIntervalSinceNow: 5)
        while !ready && error == nil && Date() < deadline { pump(0.01) }
        guard ready else {
            let failure = NativeFailure("CURSOR_RENDER_FAILED", error?.localizedDescription ?? "The original cursor did not load.")
            hide(); web?.navigationDelegate = nil; web?.stopLoading(); panel?.close()
            web = nil; panel = nil; ready = false; error = nil
            throw failure
        }
    }

    func show(_ point: CGPoint) throws {
        guard ready, let panel = panel, let web = web else { throw NativeFailure("CURSOR_RENDER_FAILED", "The original cursor is not ready.") }
        generation += 1
        hideTimer?.invalidate(); hideTimer = nil; hiding = false
        let current = generation, top = NSScreen.screens.first?.frame.maxY ?? 0
        let location = NSPoint(x: point.x, y: top - point.y)
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(location) }) else {
            throw NativeFailure("CURSOR_RENDER_FAILED", "The cursor point is outside the connected displays.")
        }
        let changedDisplay = panel.frame != screen.frame
        panel.setFrame(screen.frame, display: false)
        panel.orderFrontRegardless()
        var complete = false, failure: Error?
        web.callAsyncJavaScript("return await globalThis.__opencuCursor.update({x,y,visible:true,animateMovement:animate,waitForArrival:true})",
            arguments: ["x": location.x - screen.frame.minX, "y": screen.frame.maxY - location.y, "animate": !changedDisplay],
            in: nil, in: .page, completionHandler: { result in
                if case .failure(let error) = result { failure = error }
                complete = true
            })
        let deadline = Date(timeIntervalSinceNow: 3)
        while !complete && current == generation && Date() < deadline { pump(0.004) }
        guard complete, failure == nil, current == generation else {
            hide(); throw NativeFailure("CURSOR_RENDER_FAILED", failure?.localizedDescription ?? "Cursor rendering was interrupted or timed out.")
        }
        panel.orderFrontRegardless()
        if lifetimeTimer == nil {
            lifetimeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                guard let self = self else { return }
                if self.targetIsValid?() == false { self.hide() }
            }
        }
    }

    func hide() {
        lifetimeTimer?.invalidate(); lifetimeTimer = nil; targetIsValid = nil
        if hiding { return }
        generation += 1
        let current = generation
        guard ready, let web = web, panel?.isVisible == true else { panel?.orderOut(nil); return }
        hiding = true
        let finish: () -> Void = { [weak self] in
            guard let self = self, self.generation == current else { return }
            self.hideTimer?.invalidate(); self.hideTimer = nil; self.hiding = false
            self.panel?.orderOut(nil)
        }
        hideTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { _ in finish() }
        web.callAsyncJavaScript("return await globalThis.__opencuCursor.update({visible:false})",
            arguments: [:], in: nil, in: .page, completionHandler: { _ in finish() })
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { if webView === web { ready = true } }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError failure: Error) { if webView === web { error = failure } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError failure: Error) { if webView === web { error = failure } }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel)
    }
}
