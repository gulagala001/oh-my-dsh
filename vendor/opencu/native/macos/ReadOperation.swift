import Foundation

final class Cancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var epoch = 0
    func current() -> Int { lock.lock(); defer { lock.unlock() }; return epoch }
    func stop() { lock.lock(); epoch += 1; lock.unlock() }
    func check(_ expected: Int) throws {
        if current() != expected { throw NativeFailure("CONTROL_STOPPED", "Native read was interrupted by stop/release.") }
    }
}

// The worker may own only private read snapshots. Input, UI, activity observers,
// and committing a successful snapshot remain on the main command lane.
private final class ReadOperation<Value>: @unchecked Sendable {
    private let condition = NSCondition()
    private var result: Result<Value, Error>?
    private let work: () throws -> Value
    init(_ work: @escaping () throws -> Value) { self.work = work }
    func start() {
        DispatchQueue.global(qos: .userInitiated).async {
            let value = Result { try self.work() }
            self.condition.lock(); self.result = value
            self.condition.signal(); self.condition.unlock()
        }
    }
    func wait(cancellation: Cancellation, epoch: Int) throws -> Value {
        while true {
            try cancellation.check(epoch)
            condition.lock()
            if let value = result {
                condition.unlock()
                try cancellation.check(epoch)
                return try value.get()
            }
            _ = condition.wait(until: Date(timeIntervalSinceNow: 0.01))
            condition.unlock()
        }
    }
}

func cancellableRead<Value>(_ cancellation: Cancellation, epoch: Int, work: @escaping () throws -> Value) throws -> Value {
    try cancellation.check(epoch)
    let operation = ReadOperation {
        try cancellation.check(epoch)
        let value = try work()
        try cancellation.check(epoch)
        return value
    }
    operation.start()
    return try operation.wait(cancellation: cancellation, epoch: epoch)
}
