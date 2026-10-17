import Foundation
import Darwin

func permissionOwnerPID() -> pid_t? {
    guard let address = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_get_pid_responsible_for_pid") else { return nil }
    let responsible = unsafeBitCast(address, to: (@convention(c) (pid_t) -> pid_t).self)
    return responsible(getpid())
}

// A spawned helper otherwise inherits DSH's TCC identity, not its own authorization.
func ensurePermissionOwner() throws {
    guard let owner = permissionOwnerPID(), owner > 0 else {
        throw NativeFailure("PERMISSION_OWNER_UNAVAILABLE", "macOS could not determine the helper's permission owner.")
    }
    if owner == getpid() { return }
    guard !CommandLine.arguments.contains("--permission-owner"),
          let address = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim") else {
        throw NativeFailure("PERMISSION_OWNER_UNAVAILABLE", "macOS could not launch OpenCU Helper with its own permissions.", ["responsiblePID": owner])
    }
    let disclaim = unsafeBitCast(address, to: (@convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Bool) -> Int32).self)
    var attributes: posix_spawnattr_t?
    var result = posix_spawnattr_init(&attributes)
    guard result == 0 else { throw NativeFailure("PERMISSION_OWNER_UNAVAILABLE", "Could not initialize the helper launch.", ["errno": result]) }
    defer { posix_spawnattr_destroy(&attributes) }
    result = posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETEXEC))
    if result == 0 { result = disclaim(&attributes, true) }
    if result == 0 {
        let executable = Bundle.main.executablePath ?? CommandLine.arguments[0]
        let arguments = ([executable] + CommandLine.arguments.dropFirst() + ["--permission-owner"]).map { strdup($0) } + [nil]
        defer { for argument in arguments { free(argument) } }
        result = arguments.withUnsafeBufferPointer { buffer in
            posix_spawn(nil, executable, nil, &attributes, UnsafeMutablePointer(mutating: buffer.baseAddress!), _NSGetEnviron().pointee)
        }
    }
    throw NativeFailure("PERMISSION_OWNER_UNAVAILABLE", "Could not start OpenCU Helper with its own permissions.", ["errno": result])
}
