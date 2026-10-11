const { AsyncLocalStorage } = require("node:async_hooks");
const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const { fileURLToPath } = require("node:url");
const { inspect } = require("node:util");
const { isArrayBuffer } = require("./realm-checks.cjs");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function formatLog(args) {
  return args
    .map((arg) =>
      typeof arg === "string" ? arg : inspect(arg, { depth: 4, colors: false }),
    )
    .join(" ");
}

function makeRejectedThenable(error) {
  return {
    then(onFulfilled, onRejected) {
      return Promise.reject(error).then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return Promise.reject(error).catch(onRejected);
    },
    finally(onFinally) {
      return Promise.reject(error).finally(onFinally);
    },
  };
}

function trackExecBackgroundOperation(execState, operation) {
  const observation = { observed: false };
  const trackedOperation = operation.then(
    () => ({ ok: true, error: null, observation }),
    (error) => ({ ok: false, error, observation }),
  );
  execState.pendingBackgroundTasks.add(trackedOperation);
  return {
    then(onFulfilled, onRejected) {
      observation.observed = true;
      return trackExecBackgroundOperation(
        execState,
        operation.then(onFulfilled, onRejected),
      );
    },
    catch(onRejected) {
      observation.observed = true;
      return trackExecBackgroundOperation(execState, operation.catch(onRejected));
    },
    finally(onFinally) {
      observation.observed = true;
      return trackExecBackgroundOperation(execState, operation.finally(onFinally));
    },
  };
}

async function drainExecBackgroundTasks(execState) {
  let firstUnhandledBackgroundError;
  while (execState.pendingBackgroundTasks.size > 0) {
    const backgroundTasks = [...execState.pendingBackgroundTasks];
    execState.pendingBackgroundTasks.clear();
    const backgroundResults = await Promise.all(backgroundTasks);
    firstUnhandledBackgroundError ??= backgroundResults.find(
      (result) => !result.ok && !result.observation.observed,
    );
  }
  if (firstUnhandledBackgroundError) {
    throw firstUnhandledBackgroundError.error;
  }
}

function toByteArray(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (isArrayBuffer(value)) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function encodeByteImage(bytes, mimeType) {
  if (bytes.byteLength === 0) {
    throw new Error("nodeRepl.emitImage expected non-empty bytes");
  }
  if (typeof mimeType !== "string" || !mimeType) {
    throw new Error("nodeRepl.emitImage expected a non-empty mimeType");
  }
  return {
    image_url: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}

function sniffImageMimeType(bytes) {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  throw new Error(
    "nodeRepl.emitImage could not infer image MIME type from bytes; expected PNG, JPEG, or WebP data",
  );
}

function normalizeEmitImageValue(value) {
  if (typeof value === "string") {
    if (!value) {
      throw new Error("nodeRepl.emitImage expected a non-empty image_url");
    }
    if (/^file:/i.test(value)) {
      const bytes = fs.readFileSync(fileURLToPath(value));
      return encodeByteImage(bytes, sniffImageMimeType(bytes));
    }
    if (!/^data:/i.test(value)) {
      throw new Error("nodeRepl.emitImage only accepts data or file URLs");
    }
    return { image_url: value };
  }
  const inferredBytes = toByteArray(value);
  if (inferredBytes) {
    return encodeByteImage(inferredBytes, sniffImageMimeType(inferredBytes));
  }
  if (isPlainObject(value) && "bytes" in value) {
    if (
      Object.keys(value).some((key) => key !== "bytes" && key !== "mimeType")
    ) {
      throw new Error("nodeRepl.emitImage received an unsupported value");
    }
    const bytes = toByteArray(value.bytes);
    if (!bytes) {
      throw new Error(
        "nodeRepl.emitImage expected bytes to be Buffer, Uint8Array, ArrayBuffer, or ArrayBufferView",
      );
    }
    return encodeByteImage(bytes, value.mimeType);
  }
  throw new Error("nodeRepl.emitImage received an unsupported value");
}

function createExecContext() {
  const storage = new AsyncLocalStorage();
  let activeId = null;

  function getOptional() {
    const state = storage.getStore();
    return state && typeof state.id === "string" && state.id ? state : null;
  }

  function getAsync() {
    const state = getOptional();
    if (state === null) {
      throw new Error("node_repl exec context not found");
    }
    return state;
  }

  function getCurrent() {
    const state = getAsync();
    // AsyncLocalStorage retains the originating store for late callbacks, but
    // results may only be attached to the currently active tool call.
    if (state.id !== activeId) {
      throw new Error("node_repl exec context not found");
    }
    return state;
  }

  return {
    get activeId() {
      return activeId;
    },
    activate(id) {
      activeId = id;
    },
    clear(id) {
      if (activeId === id) {
        activeId = null;
      }
    },
    getAsync,
    getCurrent,
    getOptional,
    run(state, operation) {
      return storage.run(state, operation);
    },
  };
}

function createNodeReplBridge({
  audioEnabled,
  cwd,
  env,
  execContext,
  homeDir,
  pendingRequests,
  send,
  tmpDir,
}) {
  let emitImageCounter = 0;
  let emitAudioCounter = 0;
  const nodeRepl = {
    cwd,
    env,
    homeDir,
    tmpDir,
    get requestMeta() {
      return execContext.getOptional()?.requestMeta ?? null;
    },
    write(value, itemId) {
      const execState = execContext.getCurrent();
      if (
        itemId !== undefined &&
        (typeof itemId !== "string" || itemId.length === 0)
      ) {
        throw new TypeError(
          "nodeRepl.write expected a nonempty string content item ID",
        );
      }
      execState.outputEvents.push({
        kind: "write",
        text: formatLog([value]),
        ...(itemId === undefined ? {} : { item_id: itemId }),
      });
    },
    emitImage(imageLike) {
      let execState;
      try {
        execState = execContext.getCurrent();
      } catch (error) {
        return makeRejectedThenable(error);
      }
      const operation = (async () => {
        const normalized = normalizeEmitImageValue(await imageLike);
        const id = `${execState.id}-emit-image-${emitImageCounter++}`;
        send({
          type: "emit_image",
          id,
          exec_id: execState.id,
          image_url: normalized.image_url,
        });
        return new Promise((resolve, reject) => {
          pendingRequests.set(id, (response) => {
            if (!response.ok) {
              reject(new Error(response.error || "emitImage failed"));
              return;
            }
            resolve();
          });
        });
      })();
      return trackExecBackgroundOperation(execState, operation);
    },
  };
  if (audioEnabled) {
    nodeRepl.emitAudio = function emitAudio(audioDataUrl) {
      let execState;
      try {
        execState = execContext.getCurrent();
      } catch (error) {
        return makeRejectedThenable(error);
      }
      const operation = (async () => {
        const audioUrl = await audioDataUrl;
        if (typeof audioUrl !== "string" || !audioUrl) {
          throw new Error("nodeRepl.emitAudio expected a non-empty audio_url");
        }
        if (!/^data:/i.test(audioUrl)) {
          throw new Error("nodeRepl.emitAudio only accepts data URLs");
        }
        const id = `${execState.id}-emit-audio-${emitAudioCounter++}`;
        send({
          type: "emit_audio",
          id,
          exec_id: execState.id,
          audio_url: audioUrl,
        });
        return new Promise((resolve, reject) => {
          pendingRequests.set(id, (response) => {
            if (!response.ok) {
              reject(new Error(response.error || "emitAudio failed"));
              return;
            }
            resolve();
          });
        });
      })();
      return trackExecBackgroundOperation(execState, operation);
    };
  }
  return nodeRepl;
}

function createWorkerRuntime({ audioEnabled, cwd, env, homeDir, tmpDir }) {
  const execContext = createExecContext();
  const pendingRequests = new Map();

  process.stdout.on("error", (error) => {
    // The host can close its response pipe before stdin during reset or exit.
    if (error.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });

  function send(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }

  function createExecState(message, extra = {}) {
    return {
      contentItems: [],
      formElicitationSupported: message.form_elicitation_supported === true,
      gaasBrowserConfig: isPlainObject(message.gaas_browser_config)
        ? Object.freeze(message.gaas_browser_config)
        : Object.freeze({}),
      id: message.exec_id ?? message.id,
      outputEvents: [],
      pendingBackgroundTasks: new Set(),
      requestMeta: isPlainObject(message.request_meta)
        ? deepFreeze(structuredClone(message.request_meta))
        : null,
      responseMeta: null,
      ...extra,
    };
  }

  function createConsole(original) {
    return {
      ...original,
      ...Object.fromEntries(
        ["log", "info", "warn", "error", "debug"].map((name) => [
          name,
          (...args) => {
            const execState = execContext.getOptional();
            if (execState) {
              execState.outputEvents.push({
                kind: "line",
                text: formatLog(args),
              });
            } else {
              original[name](...args);
            }
          },
        ]),
      ),
    };
  }

  function settle(message) {
    const resolver = pendingRequests.get(message.id);
    if (!resolver) {
      return false;
    }
    pendingRequests.delete(message.id);
    resolver(message);
    return true;
  }

  function listen(handleMessage) {
    let pendingInputSegments = [];

    function handleInputFrame(frame) {
      if (frame.length > 0 && frame[frame.length - 1] === 0x0d) {
        frame = frame.subarray(0, frame.length - 1);
      }
      const line = frame.toString("utf8");
      if (!line.trim()) {
        return;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        // Malformed JSONL frames cannot be dispatched.
        return;
      }
      handleMessage(message);
    }

    process.stdin.on("data", (chunk) => {
      const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let segmentStart = 0;
      let frameEnd = input.indexOf(0x0a);
      while (frameEnd !== -1) {
        pendingInputSegments.push(input.subarray(segmentStart, frameEnd));
        // Keep raw stdin chunks queued until a full JSONL frame is ready so we
        // only assemble the frame bytes once.
        const frame =
          pendingInputSegments.length === 1
            ? pendingInputSegments[0]
            : Buffer.concat(pendingInputSegments);
        pendingInputSegments = [];
        handleInputFrame(frame);
        segmentStart = frameEnd + 1;
        frameEnd = input.indexOf(0x0a, segmentStart);
      }
      if (segmentStart < input.length) {
        pendingInputSegments.push(input.subarray(segmentStart));
      }
    });

    process.stdin.on("end", () => {
      // The host owns worker lifetime. Once stdin closes, it can no longer
      // service worker requests, and user-created handles may keep Node alive.
      process.exit(0);
    });
  }

  return {
    createConsole,
    createExecState,
    execContext,
    listen,
    nodeRepl: createNodeReplBridge({
      audioEnabled,
      cwd,
      env,
      execContext,
      homeDir,
      pendingRequests,
      send,
      tmpDir,
    }),
    pendingRequests,
    send,
    settle,
  };
}

module.exports = {
  createWorkerRuntime,
  drainExecBackgroundTasks,
  isPlainObject,
  makeRejectedThenable,
  toByteArray,
  trackExecBackgroundOperation,
};
