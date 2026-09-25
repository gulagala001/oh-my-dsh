export function createModule(require) { const module = { exports: {} }; const exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/session-migration-support.ts
var session_migration_support_exports = {};
__export(session_migration_support_exports, {
  SessionFormatEventCollector: () => import_dsh_session_format3.SessionFormatEventCollector,
  SessionWriteLease: () => SessionWriteLease,
  createLegacySessionCatalog: () => createLegacySessionCatalog,
  createSessionFormatV3ToV4: () => import_dsh_session_format_v3_to_v42.createSessionFormatV3ToV4,
  decompressZstdPrefix: () => decompressZstdPrefix,
  generationLogFilename: () => generationLogFilename,
  historicalChildCatalogSource: () => import_dsh_session_format_v3_to_v42.historicalChildCatalogSource,
  historicalSessionFormatCatalog: () => import_dsh_session_format_catalog2.historicalSessionFormatCatalog,
  parseGenerationLogFilename: () => parseGenerationLogFilename,
  prepareJsonlMigration: () => prepareJsonlMigration,
  readDecodedJsonlSource: () => readDecodedJsonlSource,
  scanZstdFrames: () => scanZstdFrames,
  sessionFormatCatalog: () => import_dsh_session_format_catalog2.sessionFormatCatalog,
  verifyJsonlCurrentGeneration: () => verifyJsonlCurrentGeneration
});
module.exports = __toCommonJS(session_migration_support_exports);

// vendor/dsh/session-persistence-jsonl/src/lease.ts
var import_promises = require("node:fs/promises");
var import_node_path2 = require("node:path");
var import_flock = require("@deepseek-ai/node-addon-system/flock");
var import_dsh_session_persistence = require("@deepseek-ai/dsh-session-persistence");

// vendor/dsh/session-persistence-jsonl/src/win32.ts
var import_node_crypto = require("node:crypto");
var import_node_path = require("node:path");
var MOVEFILE_WRITE_THROUGH = 8;
var WAIT_OBJECT_0 = 0;
var WAIT_TIMEOUT = 258;
var ERROR_FILE_NOT_FOUND = 2;
var ERROR_PATH_NOT_FOUND = 3;
var ERROR_ACCESS_DENIED = 5;
var ERROR_NOT_SAME_DEVICE = 17;
var ERROR_SHARING_VIOLATION = 32;
var ERROR_FILE_EXISTS = 80;
var ERROR_INVALID_NAME = 123;
var ERROR_ALREADY_EXISTS = 183;
var bindings;
async function win32() {
  if (bindings !== void 0) return bindings;
  const koffi = (await Promise.resolve().then(() => __toESM(require("koffi"), 1))).default;
  const kernel32 = koffi.load("kernel32.dll");
  bindings = {
    moveFileExW: kernel32.func("__stdcall", "MoveFileExW", "int", ["str16", "str16", "uint"]),
    createSemaphoreW: kernel32.func("__stdcall", "CreateSemaphoreW", "intptr", ["void*", "int", "int", "str16"]),
    waitForSingleObject: kernel32.func("__stdcall", "WaitForSingleObject", "uint", ["intptr", "uint"]),
    releaseSemaphore: kernel32.func("__stdcall", "ReleaseSemaphore", "int", ["intptr", "int", "void*"]),
    closeHandle: kernel32.func("__stdcall", "CloseHandle", "int", ["intptr"]),
    getLastError: kernel32.func("__stdcall", "GetLastError", "uint", [])
  };
  return bindings;
}
function errnoCode(win32Code) {
  switch (win32Code) {
    case ERROR_FILE_NOT_FOUND:
    case ERROR_PATH_NOT_FOUND:
      return "ENOENT";
    case ERROR_ACCESS_DENIED:
      return "EACCES";
    case ERROR_NOT_SAME_DEVICE:
      return "EXDEV";
    case ERROR_SHARING_VIOLATION:
      return "EBUSY";
    case ERROR_FILE_EXISTS:
    case ERROR_ALREADY_EXISTS:
      return "EEXIST";
    case ERROR_INVALID_NAME:
      return "EINVAL";
    default:
      return "EIO";
  }
}
function win32Error(syscall, win32Code, path, dest) {
  const code = errnoCode(win32Code);
  const error = new Error(`${syscall} ${code} (Win32 ${win32Code}): ${path} -> ${dest}`);
  error.code = code;
  error.errno = win32Code;
  error.syscall = syscall;
  error.path = path;
  error.dest = dest;
  error.win32Code = win32Code;
  return error;
}
async function publishNewFileWin32(existing, replacement) {
  const api = await win32();
  const ok = api.moveFileExW((0, import_node_path.toNamespacedPath)(existing), (0, import_node_path.toNamespacedPath)(replacement), MOVEFILE_WRITE_THROUGH);
  if (ok === 0) throw win32Error("MoveFileExW", api.getLastError(), existing, replacement);
}
async function acquireLockHandleWin32(path) {
  const api = await win32();
  const name = `Local\\dsh-session-lock-${(0, import_node_crypto.createHash)("sha256").update((0, import_node_path.resolve)(path).toLowerCase()).digest("hex")}`;
  const handle = api.createSemaphoreW(null, 1, 1, name);
  if (handle === 0) throw win32Error("CreateSemaphoreW", api.getLastError(), path, name);
  const wait = api.waitForSingleObject(handle, 0);
  if (wait === WAIT_OBJECT_0) return handle;
  api.closeHandle(handle);
  if (wait === WAIT_TIMEOUT) throw win32Error("WaitForSingleObject", ERROR_SHARING_VIOLATION, path, name);
  throw win32Error("WaitForSingleObject", api.getLastError(), path, name);
}
async function releaseLockHandleWin32(handle) {
  const api = await win32();
  const released = api.releaseSemaphore(handle, 1, null);
  const closed = api.closeHandle(handle);
  if (released === 0 || closed === 0) throw win32Error("ReleaseSemaphore", api.getLastError(), `handle:${handle}`, `handle:${handle}`);
}

// vendor/dsh/session-persistence-jsonl/src/lease.ts
var LEASE_FILENAME = "session.lock";
function isLockContention(error) {
  const code = error?.code;
  return code === "EAGAIN" || code === "EWOULDBLOCK";
}
var SessionWriteLease = class _SessionWriteLease {
  constructor(held) {
    this.held = held;
  }
  released = false;
  /**
   * Acquire the session directory's kernel write lock.
   * @param dir - the session's artifact directory (created if absent).
   * @param id - the session the lock guards, for error identities.
   * @returns the held lock.
   * @throws {SessionAlreadyOwnedError} while another holder keeps the lock.
   */
  static async acquire(dir, id) {
    const path = (0, import_node_path2.join)(dir, LEASE_FILENAME);
    await (0, import_promises.mkdir)(dir, { recursive: true, mode: 448 });
    if (process.platform === "win32") {
      let handle;
      try {
        handle = await acquireLockHandleWin32(path);
      } catch (error) {
        if (error?.code === "EBUSY") throw new import_dsh_session_persistence.SessionAlreadyOwnedError(id);
        throw error;
      }
      return new _SessionWriteLease({ kind: "win32", handle });
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const handle = await (0, import_promises.open)(path, "w");
      try {
        try {
          await (0, import_flock.tryLockExclusive)(handle.fd);
        } catch (error) {
          if (isLockContention(error)) throw new import_dsh_session_persistence.SessionAlreadyOwnedError(id);
          throw error;
        }
        const held = await handle.stat({ bigint: true });
        const current = await (0, import_promises.stat)(path, { bigint: true }).catch((error) => {
          if (error?.code === "ENOENT") return void 0;
          throw error;
        });
        if (current !== void 0 && current.ino === held.ino && current.dev === held.dev) {
          return new _SessionWriteLease({ kind: "posix", handle });
        }
      } catch (error) {
        await handle.close();
        throw error;
      }
      await handle.close();
    }
    throw new import_dsh_session_persistence.SessionAlreadyOwnedError(id);
  }
  /**
   * Release the kernel lock by closing its descriptor or handle. The POSIX
   * lock file is never removed: every acquired lock belongs to a
   * materialized or materializing session, and keeping the file preserves
   * the stable inode later lockers verify against. Idempotent.
   */
  async release() {
    if (this.released) return;
    this.released = true;
    if (this.held.kind === "win32") {
      await releaseLockHandleWin32(this.held.handle);
      return;
    }
    await this.held.handle.close();
  }
};

// vendor/dsh/session-persistence-jsonl/src/generation.ts
var import_message_projections = require("@deepseek-ai/dsh-session-format-catalog/message-projections");
var import_node_crypto2 = require("node:crypto");
var import_promises2 = require("node:fs/promises");
var import_node_path4 = require("node:path");
var import_node_perf_hooks = require("node:perf_hooks");
var import_node_stream = require("node:stream");
var import_promises3 = require("node:timers/promises");
var import_node_util2 = require("node:util");
var import_node_zlib4 = require("node:zlib");
var import_dsh_session2 = require("@deepseek-ai/dsh-session");
var import_dsh_llm = require("@deepseek-ai/dsh-llm");
var import_dsh_session_format2 = require("@deepseek-ai/dsh-session-format");
var import_dsh_session_persistence3 = require("@deepseek-ai/dsh-session-persistence");

// vendor/dsh/session-persistence-jsonl/src/format.ts
var import_node_path3 = require("node:path");
var import_dsh_session = require("@deepseek-ai/dsh-session");
var import_dsh_session_format = require("@deepseek-ai/dsh-session-format");
var import_dsh_session_format_catalog = require("@deepseek-ai/dsh-session-format-catalog");
var import_dsh_session_format_v3_to_v4 = require("@deepseek-ai/dsh-session-format-v3-to-v4");
var import_dsh_session_persistence2 = require("@deepseek-ai/dsh-session-persistence");
function logSuffix(compression) {
  return `.jsonl${compressionSuffix(compression)}`;
}
function compressionSuffix(compression) {
  return compression === "zstd" ? ".zstd" : "";
}
function generationLogFilename(version, compression) {
  return `${(0, import_dsh_session_format.sessionFormatLogFilename)(version)}${compressionSuffix(compression)}`;
}
function parseGenerationLogFilename(filename, compression) {
  const suffix = compressionSuffix(compression);
  if (!filename.endsWith(suffix)) return void 0;
  return (0, import_dsh_session_format.parseSessionFormatLogFilename)(filename.slice(0, filename.length - suffix.length));
}
var HEADER_REQUIRED_KEYS = ["type", "version", "id", "createdAt", "isSeeded", "delegationDepth"];
var HEADER_OPTIONAL_KEYS = ["cwd", "parentSession", "origin", "agentPreset"];
var HEADER_KEYS = /* @__PURE__ */ new Set([...HEADER_REQUIRED_KEYS, ...HEADER_OPTIONAL_KEYS]);
function assertNoRetiredHeaderFields(value) {
  if (typeof value !== "object" || value === null) return;
  if (Object.hasOwn(value, "sandboxMode") || Object.hasOwn(value, "approvalPolicy")) {
    throw new Error("session header uses retired policy baseline fields");
  }
}
function fromHeaderLine(line) {
  return {
    meta: {
      version: import_dsh_session.SESSION_FORMAT_VERSION,
      id: line.id,
      createdAt: line.createdAt,
      ...line.cwd !== void 0 ? { cwd: line.cwd } : {},
      ...line.parentSession !== void 0 ? { parentSession: line.parentSession } : {},
      isSeeded: line.isSeeded,
      ...line.origin !== void 0 ? { origin: line.origin } : {},
      delegationDepth: line.delegationDepth,
      ...line.agentPreset !== void 0 ? { agentPreset: line.agentPreset } : {}
    },
    inheritedEventCount: (0, import_dsh_session.SessionLogOffset)(0)
  };
}
function isHeaderLine(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && HEADER_REQUIRED_KEYS.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => HEADER_KEYS.has(key)) && value.type === "session" && typeof value.version === "number" && typeof value.id === "string" && typeof value.createdAt === "number" && Number.isSafeInteger(value.createdAt) && value.createdAt >= 0 && !Object.is(value.createdAt, -0) && typeof value.delegationDepth === "number" && Number.isSafeInteger(value.delegationDepth) && value.delegationDepth >= 0 && !Object.is(value.delegationDepth, -0) && (value.cwd === void 0 || typeof value.cwd === "string" && (0, import_node_path3.isAbsolute)(value.cwd)) && (value.parentSession === void 0 || typeof value.parentSession === "string") && typeof value.isSeeded === "boolean" && (value.origin === void 0 || value.origin === "subagent") && (value.agentPreset === void 0 || typeof value.agentPreset === "string");
}
function refuseForeignFormatVersion(parsed) {
  const { version, id } = parsed;
  if (typeof version !== "number" || version === import_dsh_session.SESSION_FORMAT_VERSION) return;
  throw new import_dsh_session_persistence2.SessionFormatUnsupportedError(
    (0, import_dsh_session_persistence2.sessionFormatVersionRefusal)(typeof id === "string" ? id : String(id), version)
  );
}
function parseHeaderRecord(record) {
  if (record.length === 0 || record.at(-1) !== 10 || record.indexOf(10) !== record.length - 1) {
    throw new Error("empty or header-less session log");
  }
  let parsed;
  try {
    parsed = JSON.parse(record.subarray(0, -1).toString("utf8"));
  } catch {
    throw new Error("corrupt session log: header line is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("corrupt session log: first line is not a JSON object");
  }
  refuseForeignFormatVersion(parsed);
  assertNoRetiredHeaderFields(parsed);
  if (!isHeaderLine(parsed)) {
    throw new Error("corrupt session log: first line is not a session header");
  }
  let restore;
  try {
    restore = import_dsh_session_format_catalog.sessionFormatCatalog.createRestore(parsed, {
      recovery: "strict",
      validation: "transformed"
    });
  } catch {
    throw new Error("corrupt session log: first line is not a session header");
  }
  return { meta: fromHeaderLine(parsed).meta, restore };
}
var SessionLogScanner = class {
  /**
   * Create an event scanner from exactly one newline-terminated header record.
   * @param headerRecord - the complete first JSONL record, including its newline.
   */
  constructor(headerRecord, recovery = "recoverable") {
    this.recovery = recovery;
    const parsed = parseHeaderRecord(headerRecord);
    this.meta = parsed.meta;
    this.restore = parsed.restore;
    this.inputBytes = headerRecord.length;
    this.committedBytes = headerRecord.length;
  }
  meta;
  restore;
  eventCount = 0;
  fragments = [];
  fragmentBytes = 0;
  inputBytes;
  committedBytes;
  eventLine = 0;
  issue;
  finished = false;
  /**
   * Consume the next raw plaintext chunk, retaining only an incomplete final record.
   * @param chunk - bytes immediately following all previously supplied bytes.
   */
  write(chunk) {
    if (this.finished) throw new Error("cannot write to a finished session log scanner");
    const chunkStart = this.inputBytes;
    this.inputBytes += chunk.length;
    let lineStart = 0;
    for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, lineStart)) {
      const fragment = chunk.subarray(lineStart, newline);
      let line = fragment;
      if (this.fragments.length > 0) {
        if (fragment.length > 0) this.fragments.push(fragment);
        line = Buffer.concat(this.fragments, this.fragmentBytes + fragment.length);
        this.fragments = [];
        this.fragmentBytes = 0;
      }
      this.consumeEventLine(line, chunkStart + newline + 1);
      lineStart = newline + 1;
    }
    if (lineStart < chunk.length) {
      const fragment = Buffer.from(chunk.subarray(lineStart));
      this.fragments.push(fragment);
      this.fragmentBytes += fragment.length;
    }
  }
  /**
   * Snapshot progress before appending a recoverable torn-frame prefix.
   * @returns byte, committed-prefix, and expanded-event cursors.
   */
  checkpoint() {
    return {
      inputBytes: this.inputBytes,
      committedBytes: this.committedBytes,
      eventCount: (0, import_dsh_session.SessionLogOffset)(this.eventCount)
    };
  }
  /**
   * Finish scanning, ignoring a final record without a newline as a torn tail.
   * @returns the header, contiguous event prefix, and safe truncation offset.
   */
  finish() {
    this.finished = true;
    const artifact = this.restore.finish();
    (0, import_dsh_session_format_v3_to_v4.assertReleasedV4Relationships)(artifact, import_dsh_session.KNOWN_SESSION_EVENT_TYPES);
    return {
      meta: this.meta,
      inheritedEventCount: (0, import_dsh_session.SessionLogOffset)(artifact.inheritedEventCount),
      events: artifact.events,
      committedBytes: this.committedBytes
    };
  }
  /** Decode one complete event row and update the contiguous prefix. */
  consumeEventLine(line, endByte) {
    this.eventLine += 1;
    let decoded;
    try {
      decoded = JSON.parse(line.toString("utf8"));
    } catch {
      const issue = new Error(`corrupt session log: unparsable committed event at line ${this.eventLine}`);
      if (this.recovery === "strict") throw issue;
      this.issue ??= issue;
      return;
    }
    try {
      (0, import_dsh_session_format_v3_to_v4.assertV4RowAdmission)(decoded, import_dsh_session.KNOWN_SESSION_EVENT_TYPES);
    } catch (error) {
      if (error instanceof import_dsh_session_format.SessionFormatUnsupportedMigrationError) throw new import_dsh_session_persistence2.SessionFormatUnsupportedError(error.message);
      throw error;
    }
    if (this.issue !== void 0) {
      if (typeof decoded === "object" && decoded !== null && decoded.type === "turn/end") throw this.issue;
      return;
    }
    try {
      this.restore.decodeRow(decoded);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const issue = new Error(`corrupt session log: invalid committed event at line ${this.eventLine}: ${detail}`, {
        cause: error
      });
      if (this.recovery === "strict") throw issue;
      this.issue = issue;
      if (typeof decoded === "object" && decoded !== null && decoded.type === "turn/end") throw issue;
      return;
    }
    this.eventCount += 1;
    this.committedBytes = endByte;
  }
};

// vendor/dsh/session-persistence-jsonl/src/zstd.ts
var import_node_zlib3 = require("node:zlib");
var import_node_util = require("node:util");

// vendor/dsh/session-persistence-jsonl/src/zstd-private-decoder.ts
var import_node_buffer = require("node:buffer");
var import_node_zlib = require("node:zlib");
var DECODE_CHUNK_SIZE = 1024 * 1024;
function privateZstdStream(stream) {
  const candidate = stream;
  const handle = candidate._handle;
  const errorKey = Reflect.ownKeys(stream).find((key) => typeof key === "symbol" && key.description === "kError");
  if (typeof handle !== "object" || handle === null || typeof handle.writeSync !== "function" || !(candidate._writeState instanceof Uint32Array) || candidate._writeState.length < 2 || typeof candidate._defaultFlushFlag !== "number" || errorKey === void 0 || candidate[errorKey] !== null) return void 0;
  return { stream, errorKey };
}
var NodePrivateZstdFrameDecoder = class _NodePrivateZstdFrameDecoder {
  constructor(stream, errorKey) {
    this.stream = stream;
    this.errorKey = errorKey;
    this.stream.on("error", (error) => {
      this.decoderError ??= error;
    });
  }
  output = Buffer.allocUnsafe(DECODE_CHUNK_SIZE);
  decoderError;
  started = false;
  closed = false;
  /**
   * Create the optimized decoder when this Node release exposes the expected
   * private stream shape.
   * @returns a shared decoder, or `undefined` when callers must use the public fallback.
   */
  static create() {
    const stream = (0, import_node_zlib.createZstdDecompress)({ chunkSize: DECODE_CHUNK_SIZE });
    const privateAccess = privateZstdStream(stream);
    if (privateAccess !== void 0) {
      return new _NodePrivateZstdFrameDecoder(privateAccess.stream, privateAccess.errorKey);
    }
    stream.close();
    return void 0;
  }
  /** @inheritdoc */
  *decode(source, frames) {
    if (this.started) throw new Error("Zstandard frame decoder was already started");
    if (this.closed) throw new Error("cannot start a closed Zstandard frame decoder");
    this.started = true;
    try {
      for (const frame of frames) {
        try {
          yield this.decodeFrame(source.subarray(frame.start, frame.end));
        } catch (error) {
          throw new Error(`corrupt Zstandard session log: frame at byte ${frame.start} failed validation`, {
            cause: error
          });
        }
      }
    } finally {
      this.close();
    }
  }
  /** Decode one frame; its returned scratch view remains valid until the next call. */
  decodeFrame(input) {
    const handle = this.stream._handle;
    if (this.closed || handle === null) throw new Error("cannot decode with a closed Zstandard frame decoder");
    let inputOffset = 0;
    let inputRemaining = input.length;
    let outputBytes = 0;
    const fullChunks = [];
    for (; ; ) {
      handle.writeSync(
        this.stream._defaultFlushFlag,
        input,
        inputOffset,
        inputRemaining,
        this.output,
        0,
        this.output.length
      );
      if (this.decoderError !== void 0) throw this.decoderError;
      const internalError = this.stream[this.errorKey];
      if (internalError !== null) {
        if (internalError instanceof Error) throw internalError;
        throw new Error("Zstandard decoder exposed a non-Error internal failure");
      }
      const outputAfter = this.stream._writeState[0];
      const inputAfter = this.stream._writeState[1];
      const consumed = inputRemaining - inputAfter;
      const produced = this.output.length - outputAfter;
      if (produced > 0) {
        outputBytes += produced;
        if (outputBytes > import_node_buffer.constants.MAX_LENGTH) {
          throw new Error(`Zstandard frame output exceeds ${import_node_buffer.constants.MAX_LENGTH} bytes`);
        }
      }
      if (outputAfter !== 0) {
        if (inputAfter !== 0) throw new Error("Zstandard frame decoder left trailing input");
        const finalChunk = this.output.subarray(0, produced);
        if (fullChunks.length === 0) return finalChunk;
        if (produced > 0) fullChunks.push(Buffer.from(finalChunk));
        const onlyChunk = fullChunks[0];
        return fullChunks.length === 1 ? onlyChunk : Buffer.concat(fullChunks, outputBytes);
      }
      fullChunks.push(Buffer.from(this.output));
      inputOffset += consumed;
      inputRemaining = inputAfter;
    }
  }
  /** @inheritdoc */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.stream.close();
  }
};

// vendor/dsh/session-persistence-jsonl/src/zstd-public-decoder.ts
var import_node_zlib2 = require("node:zlib");
var PublicZstdFrameDecoder = class {
  started = false;
  closed = false;
  /** @inheritdoc */
  *decode(source, frames) {
    if (this.started) throw new Error("Zstandard frame decoder was already started");
    if (this.closed) throw new Error("cannot start a closed Zstandard frame decoder");
    this.started = true;
    try {
      for (const { start, end } of frames) {
        let decoded;
        try {
          decoded = (0, import_node_zlib2.zstdDecompressSync)(source.subarray(start, end));
        } catch (error) {
          throw new Error(`corrupt Zstandard session log: frame at byte ${start} failed validation`, {
            cause: error
          });
        }
        yield decoded;
      }
    } finally {
      this.close();
    }
  }
  /** @inheritdoc */
  close() {
    this.closed = true;
  }
};

// vendor/dsh/session-persistence-jsonl/src/zstd.ts
var ZSTD_MAGIC = 4247762216;
var zstdCompressAsync = (0, import_node_util.promisify)(import_node_zlib3.zstdCompress);
var zstdDecompressAsync = (0, import_node_util.promisify)(import_node_zlib3.zstdDecompress);
var CHECKSUM_OPTIONS = {
  params: { [import_node_zlib3.constants.ZSTD_c_checksumFlag]: 1 }
};
var INCOMPLETE_FRAME_OPTIONS = {
  finishFlush: import_node_zlib3.constants.ZSTD_e_flush
};
function scanZstdFrames(buffer, maxFrames = Number.POSITIVE_INFINITY) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
    }
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) {
      throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
    }
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (; ; ) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = blockHeader >>> 1 & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) {
        throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
      }
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
    if (frames.length === maxFrames) return { frames };
  }
  return { frames };
}
async function compressZstdFrame(input) {
  return zstdCompressAsync(input, CHECKSUM_OPTIONS);
}
function createZstdFrameDecoder() {
  return NodePrivateZstdFrameDecoder.create() ?? new PublicZstdFrameDecoder();
}
async function decompressZstdPrefix(input) {
  return zstdDecompressAsync(input, INCOMPLETE_FRAME_OPTIONS);
}

// vendor/dsh/session-persistence-jsonl/src/generation.ts
var MIGRATION_DECODE_YIELD_INTERVAL_MS = 500;
var MIGRATION_WORK_CHUNK_BYTES = 1024 * 1024;
var MIGRATION_WRITE_CHUNK_BYTES = 4 * 1024 * 1024;
var ZSTD_CHECKSUM_OPTIONS = {
  chunkSize: MIGRATION_WORK_CHUNK_BYTES,
  params: { [import_node_zlib4.constants.ZSTD_c_checksumFlag]: 1 }
};
var JsonlGenerationSourceChangedError = class extends Error {
  /** @param path - historical generation whose revision changed. */
  constructor(path) {
    super(`historical session generation changed during migration: "${path}"`);
    this.path = path;
  }
  name = "JsonlGenerationSourceChangedError";
};
var JsonlGenerationUnsupportedMigrationError = class extends Error {
  /**
   * @param fromVersion - unchanged source generation version.
   * @param reason - format-edge refusal.
   */
  constructor(fromVersion, reason) {
    super(reason.message, { cause: reason });
    this.fromVersion = fromVersion;
    this.reason = reason;
  }
  name = "JsonlGenerationUnsupportedMigrationError";
};
var JsonlGenerationTargetConflictError = class extends Error {
  /**
   * @param path - immutable target that prevented exclusive publication.
   * @param reason - why the existing target cannot be accepted.
   */
  constructor(path, reason) {
    super(`current session generation already exists at "${path}": ${reason.message}`, { cause: reason });
    this.path = path;
    this.reason = reason;
  }
  name = "JsonlGenerationTargetConflictError";
};
var defaultFileSystem = {
  open: (path, flags, mode) => (0, import_promises2.open)(path, flags, mode),
  readFile: (path, signal) => (0, import_promises2.readFile)(path, signal === void 0 ? void 0 : { signal }),
  readdir: (path) => (0, import_promises2.readdir)(path),
  stat: (path) => (0, import_promises2.stat)(path, { bigint: true }),
  lstat: (path) => (0, import_promises2.lstat)(path),
  link: import_promises2.link,
  rm: (path) => (0, import_promises2.rm)(path, { force: true })
};
var defaultInternals = {
  fs: defaultFileSystem,
  randomToken: () => (0, import_node_crypto2.randomBytes)(8).toString("hex"),
  platform: process.platform,
  publishNewWin32: publishNewFileWin32,
  barrier: () => {
  }
};
function isEEXIST(error) {
  return error?.code === "EEXIST";
}
function isErrnoException(error) {
  return typeof error?.code === "string";
}
function identity(value) {
  return [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(":");
}
async function readStableJsonlFile(path, signal) {
  return defaultGenerationRuntime.readStable(path, signal);
}
async function readStableSnapshot(path, signal, fs) {
  signal?.throwIfAborted();
  let before = await fs.stat(path);
  for (let attempt = 0; ; attempt += 1) {
    const bytes = await fs.readFile(path, signal);
    signal?.throwIfAborted();
    const after = await fs.stat(path);
    if (identity(before) === identity(after)) {
      signal?.throwIfAborted();
      return { bytes, identity: after };
    }
    if (attempt === 1) {
      return { bytes: bytes.subarray(0, Number(before.size)), identity: before };
    }
    before = after;
  }
}
function storedVersion(header) {
  if (typeof header !== "object" || header === null || Array.isArray(header)) {
    throw new Error("corrupt session log: first line is not a JSON object");
  }
  const version = header.version;
  if (!Number.isSafeInteger(version) || version < 0 || Object.is(version, -0)) {
    throw new Error("corrupt session log: header version is not a non-negative safe integer");
  }
  return version;
}
function parseJson(text, subject) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`corrupt session log: ${subject} is not valid JSON`, { cause: error });
  }
}
var MigratingJsonlRows = class {
  constructor(restore) {
    this.restore = restore;
  }
  fragments = [];
  fragmentBytes = 0;
  rowIndex = 0;
  issue;
  /** Consume plaintext bytes following the independently decoded header. */
  write(chunk) {
    let lineStart = 0;
    for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, lineStart)) {
      const fragment = chunk.subarray(lineStart, newline);
      let line = fragment;
      if (this.fragments.length > 0) {
        if (fragment.length > 0) this.fragments.push(fragment);
        line = Buffer.concat(this.fragments, this.fragmentBytes + fragment.length);
        this.fragments = [];
        this.fragmentBytes = 0;
      }
      this.consume(line);
      lineStart = newline + 1;
    }
    if (lineStart < chunk.length) {
      const fragment = Buffer.from(chunk.subarray(lineStart));
      this.fragments.push(fragment);
      this.fragmentBytes += fragment.length;
    }
  }
  /** Refuse a record fragment left by structurally complete Zstandard frames. */
  assertCompleteFramesEndOnRecord() {
    if (this.fragments.length > 0) {
      throw new Error("corrupt Zstandard session log: complete frame contains a torn JSONL record");
    }
  }
  finish() {
    return this.restore.finish();
  }
  consume(line) {
    const index = this.rowIndex;
    this.rowIndex += 1;
    let row;
    try {
      row = parseJson(line.toString("utf8"), `row ${index + 1}`);
    } catch (error) {
      this.issue ??= asError(error);
      return;
    }
    if (this.issue !== void 0) {
      if (typeof row === "object" && row !== null && row.type === "turn/end") throw this.issue;
      return;
    }
    this.restore.decodeRow(row);
  }
};
async function startMigrationStream(headerRecord, sourceVersion, format, validateHistoricalHeader) {
  const value = parseJson(headerRecord.subarray(0, -1).toString("utf8"), "header line");
  const version = storedVersion(value);
  if (version !== sourceVersion) {
    throw new Error(`resolved JSONL source filename identifies v${sourceVersion}, but its header identifies v${version}`);
  }
  const header = value;
  const validation = validateHistoricalHeader?.(header);
  if (validation !== void 0) await validation;
  const stream = format.createRestore(header);
  return { parser: new MigratingJsonlRows(stream) };
}
async function consumeMigrationBytes(rows, chunks, signal) {
  signal?.throwIfAborted();
  let yieldDeadline = import_node_perf_hooks.performance.now() + MIGRATION_DECODE_YIELD_INTERVAL_MS;
  for (const bytes of chunks) {
    for (let offset = 0; offset < bytes.length; offset += MIGRATION_WORK_CHUNK_BYTES) {
      rows.write(bytes.subarray(offset, offset + MIGRATION_WORK_CHUNK_BYTES));
      if (import_node_perf_hooks.performance.now() < yieldDeadline) continue;
      await import_promises3.scheduler.yield();
      signal?.throwIfAborted();
      yieldDeadline = import_node_perf_hooks.performance.now() + MIGRATION_DECODE_YIELD_INTERVAL_MS;
    }
  }
}
async function decodeStreamingMigration(bytes, compression, sourceVersion, format, validateHistoricalHeader, signal) {
  signal?.throwIfAborted();
  if (compression === "none") {
    const headerEnd = bytes.indexOf(10);
    if (headerEnd === -1) throw new Error("empty or header-less session log");
    const stream = await startMigrationStream(
      bytes.subarray(0, headerEnd + 1),
      sourceVersion,
      format,
      validateHistoricalHeader
    );
    signal?.throwIfAborted();
    const bodyEnd = bytes.lastIndexOf(10);
    if (bodyEnd > headerEnd) {
      await consumeMigrationBytes(
        stream.parser,
        [bytes.subarray(headerEnd + 1, bodyEnd + 1)],
        signal
      );
    }
    return stream.parser.finish();
  }
  const { frames, tornStart } = scanZstdFrames(bytes);
  if (frames.length === 0) throw new Error("empty or header-less Zstandard session log");
  const decoder = createZstdFrameDecoder();
  try {
    const decoded = decoder.decode(bytes, frames);
    const first = decoded.next();
    if (first.done) throw new Error("empty or header-less Zstandard session log");
    assertIndependentHeaderFrame(first.value);
    const stream = await startMigrationStream(
      first.value,
      sourceVersion,
      format,
      validateHistoricalHeader
    );
    signal?.throwIfAborted();
    await consumeMigrationBytes(stream.parser, decoded, signal);
    stream.parser.assertCompleteFramesEndOnRecord();
    if (tornStart !== void 0) {
      let recovered = Buffer.alloc(0);
      try {
        recovered = await decompressZstdPrefix(bytes.subarray(tornStart));
      } catch {
        if (signal?.aborted) signal.throwIfAborted();
      }
      signal?.throwIfAborted();
      const newline = recovered.lastIndexOf(10);
      if (newline !== -1) {
        await consumeMigrationBytes(
          stream.parser,
          [recovered.subarray(0, newline + 1)],
          signal
        );
      }
    }
    return stream.parser.finish();
  } finally {
    decoder.close();
  }
}
async function verifyJsonlCurrentGeneration(path, compression, expectedId, expectedEventCount, expectedPrefix) {
  return defaultGenerationRuntime.verify(path, compression, expectedId, expectedEventCount, expectedPrefix);
}
async function verifyCurrentGeneration(path, compression, expectedId, expectedEventCount, fs, expectedPrefix) {
  const before = await fs.stat(path);
  const bytes = await fs.readFile(path);
  const after = await fs.stat(path);
  if (expectedPrefix !== void 0) {
    if (bytes.length < expectedPrefix.bytes) {
      throw new Error("target bytes are shorter than the migrated generation");
    }
    const digest = (0, import_node_crypto2.createHash)("sha256").update(bytes.subarray(0, expectedPrefix.bytes)).digest("hex");
    if (digest !== expectedPrefix.digest) {
      throw new Error("target bytes do not begin with the migrated generation");
    }
    return { identity: after, bytes: expectedPrefix.bytes, digest };
  }
  if (identity(before) !== identity(after)) {
    throw new Error("current session generation changed during verification");
  }
  const snapshot = { bytes, identity: after };
  const generation = decodeCurrentGeneration(snapshot.bytes, compression);
  (0, import_dsh_session_persistence3.validateStoredEvents)(generation.meta, generation.events, { kind: "jsonl", path });
  if (generation.meta.id !== expectedId) {
    throw new Error(`current session generation contains id "${generation.meta.id}", expected "${expectedId}"`);
  }
  if (generation.events.length !== expectedEventCount) {
    throw new Error(
      `current session generation contains ${generation.events.length} events, expected ${expectedEventCount}`
    );
  }
  import_dsh_session2.Session.fromRestore(
    generation.meta.id,
    generation.events,
    generation.meta,
    generation.inheritedEventCount,
    "detached",
    import_message_projections.currentSessionMessageProjections
  );
  assertCurrentAssistantStreams(generation.events);
  return {
    identity: snapshot.identity,
    bytes: snapshot.bytes.length,
    digest: (0, import_node_crypto2.createHash)("sha256").update(snapshot.bytes).digest("hex")
  };
}
function assertCurrentAssistantStreams(events) {
  for (const [index, event] of events.entries()) {
    if (event.type !== "assistant/message" && event.type !== "assistant/attempt") continue;
    const assembler = new import_dsh_llm.BlockAssembler();
    let timed;
    try {
      timed = (0, import_dsh_llm.expandAssistantStream)(event.data.stream);
      for (const member of timed) assembler.push(member.chunk);
    } catch (error) {
      throw new Error(`seed ${event.type} at index ${index} has an invalid embedded stream`, { cause: error });
    }
    if (event.type === "assistant/attempt" || timed.length === 0) continue;
    const content = event.data.interrupted === true ? assembler.interruptedBlocks() : assembler.blocks();
    if (!(0, import_node_util2.isDeepStrictEqual)(event.data.message.content, content)) {
      throw new Error(`seed assistant/message at index ${index} content disagrees with its embedded stream`);
    }
    if (!(0, import_node_util2.isDeepStrictEqual)(event.data.usage, assembler.usage)) {
      throw new Error(`seed assistant/message at index ${index} usage disagrees with its embedded stream`);
    }
    if (!(0, import_node_util2.isDeepStrictEqual)(event.data.message.source.replayState, assembler.replayState)) {
      throw new Error(`seed assistant/message at index ${index} replay state disagrees with its embedded stream`);
    }
  }
}
function decodeCurrentGeneration(bytes, compression) {
  if (compression === "none") {
    const headerEnd = bytes.indexOf(10);
    if (headerEnd === -1) throw new Error("empty or header-less session log");
    const scanner = new SessionLogScanner(bytes.subarray(0, headerEnd + 1), "strict");
    scanner.write(bytes.subarray(headerEnd + 1));
    return finishCurrentGenerationScan(scanner);
  }
  const { frames, tornStart } = scanZstdFrames(bytes);
  if (frames.length === 0) throw new Error("empty or header-less Zstandard session log");
  if (tornStart !== void 0) throw new Error("current session generation has a torn physical tail");
  const decoder = createZstdFrameDecoder();
  try {
    const plaintext = decoder.decode(bytes, frames);
    const header = plaintext.next();
    if (header.done) throw new Error("empty or header-less Zstandard session log");
    assertIndependentHeaderFrame(header.value);
    const scanner = new SessionLogScanner(header.value, "strict");
    for (const chunk of plaintext) scanner.write(chunk);
    return finishCurrentGenerationScan(scanner);
  } finally {
    decoder.close();
  }
}
function finishCurrentGenerationScan(scanner) {
  const inputBytes = scanner.checkpoint().inputBytes;
  const decoded = scanner.finish();
  if (decoded.committedBytes !== inputBytes) throw new Error("current session generation has a torn physical tail");
  return decoded;
}
function stringifyJson(value, subject) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    throw new Error(`${subject} is not lossless JSON`, { cause: error });
  }
  if (typeof text !== "string") throw new Error(`${subject} is not lossless JSON`);
  return text;
}
function assertIndependentHeaderFrame(plaintext) {
  if (plaintext.length === 0 || plaintext.indexOf(10) !== plaintext.length - 1) {
    throw new Error("corrupt Zstandard session log: first frame is not exactly one header line");
  }
}
function assertGenerationPaths(sourcePath, sourceVersion, currentPath, currentVersion, compression) {
  const expectedSource = generationLogFilename(sourceVersion, compression);
  const expectedCurrent = generationLogFilename(currentVersion, compression);
  if ((0, import_node_path4.basename)(sourcePath) !== expectedSource) {
    throw new Error(`resolved JSONL source path must end with "${expectedSource}": ${sourcePath}`);
  }
  if ((0, import_node_path4.basename)(currentPath) !== expectedCurrent) {
    throw new Error(`current JSONL generation path must end with "${expectedCurrent}": ${currentPath}`);
  }
  if ((0, import_node_path4.dirname)(sourcePath) !== (0, import_node_path4.dirname)(currentPath)) {
    throw new Error("source and current JSONL generations must share one Session directory");
  }
  return logSuffix(compression);
}
async function syncDirectory(path, internals) {
  if (internals.platform === "win32") return;
  const handle = await internals.fs.open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function* encodeMigrationRows(artifact, format, signal) {
  signal?.throwIfAborted();
  let lines = [];
  let bytes = 0;
  for (const value of artifact.events) {
    const line = `${stringifyJson(format.encodeEvent(value), `migrated Session event ${value.seq}`)}
`;
    const lineBytes = Buffer.byteLength(line);
    if (bytes > 0 && bytes + lineBytes > MIGRATION_WORK_CHUNK_BYTES) {
      yield Buffer.from(lines.join(""));
      await import_promises3.scheduler.yield();
      signal?.throwIfAborted();
      lines = [];
      bytes = 0;
    }
    lines.push(line);
    bytes += lineBytes;
  }
  yield Buffer.from(lines.join(""));
}
async function writeMigrationChunks(chunks, write) {
  let pending = [];
  let bytes = 0;
  for await (const chunk of chunks) {
    pending.push(chunk);
    bytes += chunk.length;
    if (bytes < MIGRATION_WRITE_CHUNK_BYTES) continue;
    await write(pending.length === 1 ? pending[0] : Buffer.concat(pending, bytes));
    pending = [];
    bytes = 0;
  }
  if (bytes > 0) await write(pending.length === 1 ? pending[0] : Buffer.concat(pending, bytes));
}
async function writeSyncedTemp(currentPath, suffix, compression, artifact, format, signal, internals) {
  signal?.throwIfAborted();
  let path;
  let handle;
  for (; ; ) {
    path = (0, import_node_path4.join)((0, import_node_path4.dirname)(currentPath), `session.migration.${internals.randomToken()}${suffix}.tmp`);
    try {
      handle = await internals.fs.open(path, "wx", 384);
      break;
    } catch (error) {
      if (isEEXIST(error)) continue;
      throw error;
    }
  }
  const hash = (0, import_node_crypto2.createHash)("sha256");
  let bytes = 0;
  const write = async (chunk) => {
    await handle.writeFile(chunk);
    hash.update(chunk);
    bytes += chunk.length;
  };
  let failure;
  try {
    const headerValue = format.encodeHeader(artifact.header, artifact.inheritedEventCount);
    const header = Buffer.from(`${stringifyJson(headerValue, "migrated session header")}
`);
    await write(compression === "zstd" ? await compressZstdFrame(header) : header);
    if (artifact.events.length > 0) {
      const rows = encodeMigrationRows(artifact, format, signal);
      if (compression === "none") {
        await writeMigrationChunks(rows, write);
      } else {
        await new Promise((resolve2, reject) => {
          (0, import_node_stream.pipeline)(
            import_node_stream.Readable.from(rows, { objectMode: false, highWaterMark: MIGRATION_WORK_CHUNK_BYTES }),
            (0, import_node_zlib4.createZstdCompress)(ZSTD_CHECKSUM_OPTIONS),
            async (source) => {
              await writeMigrationChunks(source, write);
            },
            (error) => {
              if (error instanceof Error) reject(error);
              else resolve2();
            }
          );
        });
      }
    }
    signal?.throwIfAborted();
    await handle.sync();
  } catch (error) {
    failure = error;
  }
  try {
    await handle.close();
  } catch (error) {
    failure = failure === void 0 ? error : new AggregateError([failure, error], `failed to write and close migration stage "${path}"`);
  }
  if (failure !== void 0) {
    const writeError = failure instanceof Error ? failure : new Error("migration stage write failed with a non-Error rejection", { cause: failure });
    await removeTemporary(path, writeError, internals);
    throw writeError;
  }
  return { path, bytes, digest: hash.digest("hex") };
}
async function removeTemporary(path, primaryFailure, internals) {
  try {
    await internals.fs.rm(path);
  } catch (cleanupFailure) {
    throw new AggregateError(
      [primaryFailure, cleanupFailure],
      `failed to clean migration temporary "${path}" after an earlier failure`
    );
  }
}
async function removeCommittedTemporary(path, internals) {
  try {
    await internals.fs.rm(path);
  } catch {
  }
}
async function publishCurrentExclusive(staged, currentPath, internals) {
  if (internals.platform === "win32") {
    try {
      await internals.publishNewWin32(staged, currentPath);
      return true;
    } catch (error) {
      if (isEEXIST(error)) return false;
      throw error;
    }
  }
  try {
    await internals.fs.link(staged, currentPath);
  } catch (error) {
    if (isEEXIST(error)) return false;
    throw error;
  }
  await syncDirectory((0, import_node_path4.dirname)(currentPath), internals);
  return true;
}
function asError(error) {
  return error instanceof Error ? error : new Error("current-generation validation failed with a non-Error rejection", {
    cause: error
  });
}
async function inspectExpectedCurrent(currentPath, internals, inspect) {
  try {
    const expectedName = (0, import_node_path4.basename)(currentPath);
    const names = await internals.fs.readdir((0, import_node_path4.dirname)(currentPath));
    if (!names.includes(expectedName)) {
      const noncanonical = names.find((name) => name.toLowerCase() === expectedName.toLowerCase());
      if (noncanonical !== void 0) {
        throw new Error(`target resolves to noncanonical directory entry "${noncanonical}"`);
      }
    }
    const info = await internals.fs.lstat(currentPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`target is a ${info.isSymbolicLink() ? "symbolic link" : "non-regular file"}`);
    }
    return await inspect();
  } catch (error) {
    if (isErrnoException(error)) throw error;
    throw new JsonlGenerationTargetConflictError(currentPath, asError(error));
  }
}
function withOverrides(overrides) {
  return {
    ...defaultInternals,
    ...overrides,
    fs: { ...defaultFileSystem, ...overrides.fs }
  };
}
async function publishPreparedMigration(options, suffix, artifact, sourceIdentity, internals) {
  await import_promises3.scheduler.yield();
  const { sourcePath, currentPath, compression, verifyCurrentFile } = options;
  const eventCount = artifact.events.length;
  let staged = await writeSyncedTemp(currentPath, suffix, compression, artifact, options.format, void 0, internals);
  try {
    const verifiedStage = await verifyCurrentFile(
      staged.path,
      compression,
      artifact.header.id,
      eventCount
    );
    if (verifiedStage.bytes !== staged.bytes || verifiedStage.digest !== staged.digest) {
      throw new Error("staged session generation changed during verification");
    }
    await internals.barrier("before-source-check", 1);
    await options.validateRelatedSources?.();
    const beforePublish = await internals.fs.stat(sourcePath);
    if (identity(beforePublish) !== identity(sourceIdentity)) {
      throw new JsonlGenerationSourceChangedError(sourcePath);
    }
    const published = await publishCurrentExclusive(staged.path, currentPath, internals);
    if (published && internals.platform === "win32") staged = { ...staged, path: "" };
    await internals.barrier("after-publication", 1);
    let currentIdentity;
    if (published) {
      if (staged.path !== "") {
        await removeCommittedTemporary(staged.path, internals);
        staged = { ...staged, path: "" };
      }
      currentIdentity = await internals.fs.stat(currentPath);
    } else {
      const winner = await inspectExpectedCurrent(currentPath, internals, async () => {
        const candidate = await verifyCurrentFile(
          currentPath,
          compression,
          artifact.header.id,
          eventCount,
          staged
        );
        if (candidate.bytes !== staged.bytes || candidate.digest !== staged.digest) {
          throw new Error("target bytes differ from the migrated generation");
        }
        return candidate;
      });
      currentIdentity = winner.identity;
      await removeCommittedTemporary(staged.path, internals);
      staged = { ...staged, path: "" };
    }
    return currentIdentity;
  } catch (error) {
    if (staged.path !== "") await removeTemporary(staged.path, error, internals);
    throw error;
  }
}
async function prepareMigration(options, internals) {
  const { sourcePath, sourceVersion, currentPath, compression, format, signal } = options;
  const suffix = assertGenerationPaths(
    sourcePath,
    sourceVersion,
    currentPath,
    format.currentVersion,
    compression
  );
  if (sourceVersion >= format.currentVersion) {
    throw new Error(`migration preparation requires a historical source, got v${sourceVersion}`);
  }
  const source = await readStableSnapshot(sourcePath, signal, internals.fs);
  let artifact;
  try {
    artifact = await decodeStreamingMigration(
      source.bytes,
      compression,
      sourceVersion,
      format,
      options.validateHistoricalHeader,
      signal
    );
  } catch (error) {
    if (format.isUnsupportedMigrationError?.(error) === true) {
      throw new JsonlGenerationUnsupportedMigrationError(sourceVersion, error);
    }
    throw error;
  }
  if (artifact.header.version !== format.currentVersion) {
    throw new Error(`format migration returned v${artifact.header.version}, expected v${format.currentVersion}`);
  }
  await options.validateRelatedSources?.();
  const sourceIdentity = source.identity;
  let publication;
  return {
    sourceIdentity,
    artifact,
    publish() {
      if (publication === void 0) {
        publication = publishPreparedMigration(
          options,
          suffix,
          artifact,
          sourceIdentity,
          internals
        );
      }
      return publication;
    }
  };
}
function prepareJsonlMigration(options) {
  return defaultGenerationRuntime.prepare(options);
}
function createJsonlGenerationRuntime(overrides = {}) {
  const internals = withOverrides(overrides);
  return {
    readStable: (path, signal) => readStableSnapshot(path, signal, internals.fs),
    prepare: (options) => prepareMigration(options, internals),
    verify: (path, compression, expectedId, expectedEventCount, expectedPrefix) => verifyCurrentGeneration(
      path,
      compression,
      expectedId,
      expectedEventCount,
      internals.fs,
      expectedPrefix
    )
  };
}
var defaultGenerationRuntime = createJsonlGenerationRuntime();
async function readDecodedJsonlSource(path, version, compression, format, signal) {
  const source = await readStableJsonlFile(path, signal);
  let artifact;
  try {
    artifact = await decodeStreamingMigration(source.bytes, compression, version, format, void 0, signal);
  } catch (error) {
    if (signal?.aborted || error instanceof import_dsh_session_format2.SessionFormatError) throw error;
    throw new import_dsh_session_format2.SessionFormatError(String(error), { cause: error });
  }
  return { artifact, identity: source.identity };
}

// src/session-migration-support.ts
var import_dsh_session_format_catalog2 = require("@deepseek-ai/dsh-session-format-catalog");
var import_dsh_session_format_v3_to_v42 = require("@deepseek-ai/dsh-session-format-v3-to-v4");
var import_dsh_session_format3 = require("@deepseek-ai/dsh-session-format");
var import_dsh_session_format4 = require("@deepseek-ai/dsh-session-format");
var import_dsh_session_format_v0_to_v1 = require("@deepseek-ai/dsh-session-format-v0-to-v1");
var import_dsh_session_format_v1_to_v2 = require("@deepseek-ai/dsh-session-format-v1-to-v2");
var import_dsh_session_format_v2_to_v3 = require("@deepseek-ai/dsh-session-format-v2-to-v3");
var import_dsh_session_format_v3_to_v43 = require("@deepseek-ai/dsh-session-format-v3-to-v4");
function createLegacySessionCatalog(normalize) {
  const restore = (artifact) => (0, import_dsh_session_format_v2_to_v3.restoreReleasedV3Artifact)(normalize(artifact), import_dsh_session_format_v3_to_v43.RELEASED_V3_EVENT_TYPES);
  return (0, import_dsh_session_format4.createSessionFormatCatalog)({
    currentVersion: 3,
    codecs: [import_dsh_session_format_v0_to_v1.releasedV0SessionFormatCodec, import_dsh_session_format_v0_to_v1.releasedV1SessionFormatCodec, import_dsh_session_format_v1_to_v2.releasedV2SessionFormatCodec, import_dsh_session_format_v2_to_v3.releasedV3SessionFormatCodec],
    currentEncoder: import_dsh_session_format_v2_to_v3.releasedV3SessionFormatCodec,
    migrations: [import_dsh_session_format_v0_to_v1.sessionFormatV0ToV1, import_dsh_session_format_v1_to_v2.sessionFormatV1ToV2, import_dsh_session_format_v2_to_v3.sessionFormatV2ToV3],
    restoreCurrent: restore,
    restoreTransformedCurrent: restore,
    restoreCurrentHeader(header) {
      (0, import_dsh_session_format_v2_to_v3.assertReleasedV3Header)(header);
      return header;
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SessionFormatEventCollector,
  SessionWriteLease,
  createLegacySessionCatalog,
  createSessionFormatV3ToV4,
  decompressZstdPrefix,
  generationLogFilename,
  historicalChildCatalogSource,
  historicalSessionFormatCatalog,
  parseGenerationLogFilename,
  prepareJsonlMigration,
  readDecodedJsonlSource,
  scanZstdFrames,
  sessionFormatCatalog,
  verifyJsonlCurrentGeneration
});
return module.exports; }
