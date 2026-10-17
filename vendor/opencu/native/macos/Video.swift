import Foundation
import AppKit
import ScreenCaptureKit
import CoreMedia
import CoreImage

/** A bounded live capture stream; monitoring never changes screenshot input mappings. */
final class WindowVideo: NSObject, SCStreamOutput, SCStreamDelegate {
    private let lock = NSLock()
    private let context = CIContext()
    private var latest: [String: Any]?
    private var failure: Error?
    private var stopped = false
    private var stream: SCStream?
    private var idle: Timer?
    private(set) var closed = false

    func start(windowID: Int) throws {
        var content: SCShareableContent?, lookupError: Error?, completed = false
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { value, error in
            content = value; lookupError = error; completed = true
        }
        let deadline = Date(timeIntervalSinceNow: 4)
        while !completed && Date() < deadline { pump(0.004) }
        if let error = lookupError { throw NativeFailure("VIDEO_CAPTURE_FAILED", error.localizedDescription) }
        guard let window = content?.windows.first(where: { Int($0.windowID) == windowID }) else {
            throw NativeFailure("TARGET_IDENTITY_CHANGED", "The native video window is no longer available.")
        }
        let config = SCStreamConfiguration()
        let scale = min(1, 900 / max(1, window.frame.width), 700 / max(1, window.frame.height))
        config.width = max(2, Int(window.frame.width * scale)); config.height = max(2, Int(window.frame.height * scale))
        config.minimumFrameInterval = CMTime(value: 1, timescale: 10)
        config.queueDepth = 3; config.showsCursor = true; config.capturesAudio = false
        let capture = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: config, delegate: self)
        try capture.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label: "opencu.video.\(windowID)"))
        stream = capture
        completed = false; lookupError = nil
        capture.startCapture { error in lookupError = error; completed = true }
        let startDeadline = Date(timeIntervalSinceNow: 4)
        while !completed && Date() < startDeadline { pump(0.004) }
        if let error = lookupError { close(); throw NativeFailure("VIDEO_CAPTURE_FAILED", error.localizedDescription) }
        if !completed { close(); throw NativeFailure("VIDEO_CAPTURE_TIMEOUT", "The native video stream did not start.") }
    }

    func frame() throws -> [String: Any] {
        idle?.invalidate()
        idle = Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { [weak self] _ in self?.close() }
        let deadline = Date(timeIntervalSinceNow: 3)
        while Date() < deadline {
            lock.lock(); let value = latest, error = failure; lock.unlock()
            if let error = error { throw NativeFailure("VIDEO_CAPTURE_FAILED", error.localizedDescription) }
            if let value = value { return value }
            if closed { throw NativeFailure("VIDEO_CAPTURE_STOPPED", "The native video stream stopped.") }
            pump(0.004)
        }
        throw NativeFailure("VIDEO_CAPTURE_TIMEOUT", "The native video stream has no complete frame.")
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = attachments.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete,
              let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lock.lock(); let inactive = stopped; lock.unlock()
        if inactive { return }
        let image = CIImage(cvPixelBuffer: buffer)
        guard let pixels = context.createCGImage(image, from: image.extent),
              let bytes = NSBitmapImageRep(cgImage: pixels).representation(using: .jpeg, properties: [.compressionFactor: 0.72]) else { return }
        let timestamp = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1_000_000
        lock.lock()
        if !stopped { latest = ["dataUrl": "data:image/jpeg;base64,\(bytes.base64EncodedString())", "width": pixels.width, "height": pixels.height,
                                "kind": "native-video", "timestamp": timestamp.isFinite ? timestamp : 0] }
        lock.unlock()
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        lock.lock(); failure = error; latest = nil; lock.unlock()
    }

    func close() {
        if closed { return }
        closed = true; idle?.invalidate(); idle = nil
        lock.lock(); stopped = true; latest = nil; lock.unlock()
        stream?.stopCapture { _ in }; stream = nil
    }
}

final class VideoStore {
    private var streams: [String: WindowVideo] = [:]
    func preview(_ target: [String: Any]) throws -> [String: Any] {
        guard CGPreflightScreenCaptureAccess() else { throw NativeFailure("SCREEN_CAPTURE_PERMISSION_REQUIRED", "Screen Recording permission is required for native video monitoring.") }
        guard let id = target["id"] as? String, let windowID = target["windowId"] as? Int else {
            throw NativeFailure("WINDOW_REQUIRED", "Choose a specific application window for video monitoring.")
        }
        streams = streams.filter { !$0.value.closed }
        if streams[id] == nil {
            let video = WindowVideo()
            do { try video.start(windowID: windowID) }
            catch { video.close(); throw error }
            streams[id] = video
        }
        do { return try streams[id]!.frame() }
        catch { streams.removeValue(forKey: id)?.close(); throw error }
    }
    func stop(_ id: String) { streams.removeValue(forKey: id)?.close() }
    func close() { for video in streams.values { video.close() }; streams.removeAll() }
}
