// Adapted from the bundled Codex node_repl kernel; source provenance is recorded locally.
// Node-based kernel for node_repl.
// Communicates over JSON lines on stdin/stdout.
// Requires Node started with --experimental-vm-modules.

const { Buffer } = require("node:buffer");
const crypto = require("node:crypto");
const fs = require("node:fs");
const {
  builtinModules,
  createRequire,
  findPackageJSON,
} = require("node:module");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const path = require("node:path");
const { parseArgs } = require("node:util");
const {
  URL,
  URLSearchParams,
  fileURLToPath,
  pathToFileURL,
} = require("node:url");
const { TextDecoder, TextEncoder } = require("node:util");
const vm = require("node:vm");
const {
  createWorkerRuntime,
  drainExecBackgroundTasks,
  makeRejectedThenable,
  trackExecBackgroundOperation,
} = require("./repl/worker-runtime.cjs");
const { redactDiagnosticSource } = require("./repl/diagnostics.cjs");

const { SourceTextModule, SyntheticModule } = vm;
const meriyahPromise = import("./repl/meriyah.cjs").then(
  (m) => m.default ?? m,
);

// vm contexts start with very few globals. Populate common Node/web globals
// so snippets and dependencies behave like a normal modern JS runtime.
function createRuntimeContext(options = undefined) {
  const runtimeContext = vm.createContext({}, options);
  runtimeContext.globalThis = runtimeContext;
  runtimeContext.global = runtimeContext;
  runtimeContext.Buffer = Buffer;
  runtimeContext.console = console;
  runtimeContext.URL = URL;
  runtimeContext.URLSearchParams = URLSearchParams;
  if (typeof TextEncoder !== "undefined") {
    runtimeContext.TextEncoder = TextEncoder;
  }
  if (typeof TextDecoder !== "undefined") {
    runtimeContext.TextDecoder = TextDecoder;
  }
  if (typeof AbortController !== "undefined") {
    runtimeContext.AbortController = AbortController;
  }
  if (typeof AbortSignal !== "undefined") {
    runtimeContext.AbortSignal = AbortSignal;
  }
  if (typeof structuredClone !== "undefined") {
    runtimeContext.structuredClone = structuredClone;
  }
  if (typeof fetch !== "undefined") {
    runtimeContext.fetch = fetch;
  }
  if (typeof Headers !== "undefined") {
    runtimeContext.Headers = Headers;
  }
  if (typeof Request !== "undefined") {
    runtimeContext.Request = Request;
  }
  if (typeof Response !== "undefined") {
    runtimeContext.Response = Response;
  }
  if (typeof performance !== "undefined") {
    runtimeContext.performance = performance;
  }
  runtimeContext.crypto = crypto.webcrypto ?? crypto;
  runtimeContext.setTimeout = setTimeout;
  runtimeContext.clearTimeout = clearTimeout;
  runtimeContext.setInterval = setInterval;
  runtimeContext.clearInterval = clearInterval;
  runtimeContext.queueMicrotask = queueMicrotask;
  if (typeof setImmediate !== "undefined") {
    runtimeContext.setImmediate = setImmediate;
    runtimeContext.clearImmediate = clearImmediate;
  }
  runtimeContext.atob = (data) =>
    Buffer.from(data, "base64").toString("binary");
  runtimeContext.btoa = (data) =>
    Buffer.from(data, "binary").toString("base64");
  return runtimeContext;
}

const runtimeContext = createRuntimeContext({
  codeGeneration: {
    strings: false,
    wasm: false,
  },
});
const moduleContext = Object.freeze({
  context: runtimeContext,
  kind: "module",
});
const packageModuleContext = Object.freeze({
  context: runtimeContext,
  isPackage: true,
  kind: "package",
});

function defineLockedGlobal(runtimeContext, name, value) {
  Object.defineProperty(runtimeContext, name, {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

function parseKernelBootstrapArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      "session-id": {
        type: "string",
      },
      "working-dir": {
        type: "string",
      },
    },
  });

  const sessionId = values["session-id"] ?? null;
  const workingDir = values["working-dir"] ?? null;

  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new Error("missing --session-id");
  }
  if (typeof workingDir !== "string" || workingDir.trim().length === 0) {
    throw new Error("missing --working-dir");
  }

  return {
    sessionId,
    workingDir,
  };
}

const kernelBootstrap = { sessionId: crypto.randomUUID(), workingDir: process.cwd() };

/**
 * @typedef {{ name: string, kind: "const"|"let"|"var"|"function"|"class" }} Binding
 */

// REPL state model:
// - Every exec is compiled as a fresh ESM "cell".
// - `previousModule` is the most recently committed module namespace.
// - `previousBindings` tracks which top-level names should be carried forward.
// Each new cell imports a synthetic view of the previous namespace and
// redeclares those names so user variables behave like a persistent REPL.
let previousModule = null;
/** @type {Binding[]} */
let previousBindings = [];
let cellCounter = 0;
let internalBindingCounter = 0;
const jsBanner = undefined; // OpenCU injects its initialized public facade.
let jsBannerExecuted = false;
const internalBindingSalt = (() => {
  const raw = kernelBootstrap.sessionId;
  const sanitized = raw.replace(/[^A-Za-z0-9_$]/g, "_");
  return sanitized || "session";
})();
let fatalExitScheduled = false;

const builtinModuleSet = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
// The kernel transport itself writes JSONL over stdout/stderr below, so exposing
// raw `process` would make it easy for user code to corrupt the stdio protocol.
// Keep this denylist narrow for now; if node_repl moves off stdio transport in
// the future, we can revisit whether `process` still needs to stay blocked.
const deniedBuiltinModules = new Set(["process", "node:process"]);

function toNodeBuiltinSpecifier(specifier) {
  return specifier.startsWith("node:") ? specifier : `node:${specifier}`;
}

function isDeniedBuiltin(specifier) {
  const normalized = specifier.startsWith("node:")
    ? specifier.slice(5)
    : specifier;
  return (
    deniedBuiltinModules.has(specifier) || deniedBuiltinModules.has(normalized)
  );
}

let trustedServiceRequestCounter = 0;
const cwd = process.cwd();
// Use Node's standard temp-dir resolution. Sandboxed launches redirect it by
// setting TMPDIR/TMP/TEMP to the writable workspace root before Node starts.
const tmpDir = os.tmpdir();
const homeDir = process.env.HOME ?? null;
const untrustedEnv = Object.freeze({});
const runtime = createWorkerRuntime({
  audioEnabled: process.env.NODE_REPL_ENABLE_AUDIO === "1",
  cwd,
  env: untrustedEnv,
  homeDir,
  tmpDir,
});
const { execContext, pendingRequests } = runtime;
let emitKernelMessage = () => {};
let emitConsoleEvent = () => {};
const send = (message) => emitKernelMessage(message);
const sourceCreateConsole = runtime.createConsole;
runtime.createConsole = (original) => {
  const captured = sourceCreateConsole(original);
  return { ...captured, ...Object.fromEntries(["log", "info", "warn", "error", "debug"].map((name) => [name, (...args) => {
    const state = execContext.getOptional();
    const count = state?.outputEvents.length;
    captured[name](...args);
    if (state && state.outputEvents.length > count) emitConsoleEvent(state.outputEvents.at(-1));
  }])) };
};
const { getCurrent: getCurrentExecState } = execContext;

const moduleSearchBases = [];
const moduleSearchBaseSet = new Set();
const hostNativePackageAdapters = new Map();

function freezeEnvSnapshot(sourceEnv) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(sourceEnv).filter(
        ([, value]) => typeof value === "string",
      ),
    ),
  );
}

function pickEnv(sourceEnv, allowlist) {
  const allowedNames = new Set(
    (allowlist ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  return Object.fromEntries(
    [...allowedNames]
      .map((name) => [name, sourceEnv[name]])
      .filter(([, value]) => typeof value === "string"),
  );
}

function normalizeModuleSearchBase(entry) {
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }
  const resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);
  return path.basename(resolved) === "node_modules"
    ? path.dirname(resolved)
    : resolved;
}

function addModuleSearchBase(entry) {
  const base = normalizeModuleSearchBase(entry);
  if (!base || moduleSearchBaseSet.has(base)) {
    return;
  }
  moduleSearchBaseSet.add(base);
  const cwdIndex = moduleSearchBases.indexOf(cwd);
  if (cwdIndex === -1) {
    moduleSearchBases.push(base);
  } else {
    moduleSearchBases.splice(cwdIndex, 0, base);
  }
}

for (const entry of (process.env.NODE_REPL_NODE_MODULE_DIRS ?? "").split(
  path.delimiter,
)) {
  addModuleSearchBase(entry);
}
if (!moduleSearchBaseSet.has(cwd)) {
  moduleSearchBaseSet.add(cwd);
  moduleSearchBases.push(cwd);
}

const importResolveConditions = new Set(["node", "import"]);
const requireByBase = new Map();
const linkedFileModules = new Map();
const linkedFileModuleContexts = new WeakMap();
const linkedNativeModules = new Map();
const linkedModuleLinkTails = new Map();
const linkedModuleEvaluations = new Map();
function clearLocalFileModuleCaches() {
  const persistentPrefix = `${packageModuleContext.kind}:`;
  for (const cache of [linkedFileModules, linkedModuleEvaluations]) {
    for (const key of cache.keys()) {
      if (!key.startsWith(persistentPrefix)) {
        cache.delete(key);
      }
    }
  }
}

function moduleCacheKey(moduleContext, value) {
  return `${moduleContext.kind}:${value}`;
}

function canonicalizePath(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return value;
  }
}

function resolveResultToUrl(resolved) {
  if (resolved.kind === "builtin") {
    return resolved.specifier;
  }
  if (resolved.kind === "file") {
    return pathToFileURL(resolved.path).href;
  }
  if (resolved.kind === "package" || resolved.kind === "esm-package") {
    return resolved.specifier;
  }
  throw new Error(`Unsupported module resolution kind: ${resolved.kind}`);
}

function setImportMeta(meta, mod, moduleContext, isMain = false) {
  meta.url = pathToFileURL(mod.identifier).href;
  meta.filename = mod.identifier;
  meta.dirname = path.dirname(mod.identifier);
  meta.main = isMain;
  meta.resolve = (specifier) =>
    resolveResultToUrl(
      resolveSpecifier(specifier, mod.identifier, moduleContext),
    );
}

function getRequireForBase(base) {
  let req = requireByBase.get(base);
  if (!req) {
    req = createRequire(path.join(base, "__node_repl__.cjs"));
    requireByBase.set(base, req);
  }
  return req;
}

function isModuleNotFoundError(err) {
  return (
    err?.code === "MODULE_NOT_FOUND" || err?.code === "ERR_MODULE_NOT_FOUND"
  );
}

function isEsmPackageFile(modulePath) {
  const extension = path.extname(modulePath).toLowerCase();
  if (extension === ".mjs") {
    return true;
  }
  if (extension !== ".js") {
    return false;
  }

  const packageJsonPath = findPackageJSON(pathToFileURL(modulePath).href);
  return (
    packageJsonPath !== undefined &&
    JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).type === "module"
  );
}

function isWithinBaseNodeModules(base, resolvedPath) {
  const canonicalBase = canonicalizePath(base);
  const canonicalResolved = canonicalizePath(resolvedPath);
  const nodeModulesRoot = path.resolve(canonicalBase, "node_modules");
  const relative = path.relative(nodeModulesRoot, canonicalResolved);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function isWithinModuleSearchBases(resolvedPath) {
  return moduleSearchBases.some((base) =>
    isWithinBaseNodeModules(base, resolvedPath),
  );
}

function isExplicitRelativePathSpecifier(specifier) {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith(".\\") ||
    specifier.startsWith("..\\")
  );
}

function isFileUrlSpecifier(specifier) {
  if (typeof specifier !== "string" || !specifier.startsWith("file:")) {
    return false;
  }
  try {
    return new URL(specifier).protocol === "file:";
  } catch {
    return false;
  }
}

function isPathSpecifier(specifier) {
  if (
    typeof specifier !== "string" ||
    !specifier ||
    specifier.trim() !== specifier
  ) {
    return false;
  }
  return (
    isExplicitRelativePathSpecifier(specifier) ||
    path.isAbsolute(specifier) ||
    isFileUrlSpecifier(specifier)
  );
}

function isBarePackageSpecifier(specifier) {
  if (
    typeof specifier !== "string" ||
    !specifier ||
    specifier.trim() !== specifier
  ) {
    return false;
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return false;
  }
  if (specifier.startsWith("/") || specifier.startsWith("\\")) {
    return false;
  }
  if (path.isAbsolute(specifier)) {
    return false;
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(specifier)) {
    return false;
  }
  if (specifier.includes("\\")) {
    return false;
  }
  return true;
}

function resolveBareSpecifier(specifier, referrerIdentifier, moduleContext) {
  let firstResolutionError = null;
  const searchBases =
    moduleContext.isPackage &&
    referrerIdentifier &&
    path.isAbsolute(referrerIdentifier)
      ? [path.dirname(referrerIdentifier)]
      : moduleSearchBases;

  for (const base of searchBases) {
    try {
      const resolved = getRequireForBase(base).resolve(specifier, {
        conditions: importResolveConditions,
      });
      if (isWithinModuleSearchBases(resolved)) {
        if (isEsmPackageFile(resolved)) {
          return { kind: "esm-package", path: resolved, specifier };
        }
        return { kind: "package", path: resolved, specifier };
      }
      // Ignore resolutions that escape this base via parent node_modules lookup.
    } catch (err) {
      if (isModuleNotFoundError(err)) {
        continue;
      }
      if (!firstResolutionError) {
        firstResolutionError = err;
      }
    }
  }

  if (firstResolutionError) {
    throw firstResolutionError;
  }
  return null;
}

function resolvePathSpecifier(specifier, referrerIdentifier, moduleContext) {
  let candidate;
  if (isFileUrlSpecifier(specifier)) {
    try {
      candidate = fileURLToPath(new URL(specifier));
    } catch (err) {
      throw new Error(
        `Failed to resolve module "${specifier}": ${err.message}`,
      );
    }
  } else {
    const baseDir =
      referrerIdentifier && path.isAbsolute(referrerIdentifier)
        ? path.dirname(referrerIdentifier)
        : process.cwd();
    candidate = path.isAbsolute(specifier)
      ? specifier
      : path.resolve(baseDir, specifier);
  }

  let resolvedPath;
  try {
    resolvedPath = fs.realpathSync.native(candidate);
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(`Module not found: ${specifier}`);
    }
    throw new Error(`Failed to resolve module "${specifier}": ${err.message}`);
  }

  let stats;
  try {
    stats = fs.statSync(resolvedPath);
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(`Module not found: ${specifier}`);
    }
    throw new Error(`Failed to inspect module "${specifier}": ${err.message}`);
  }

  if (!stats.isFile()) {
    throw new Error(
      `Unsupported import specifier "${specifier}" in node_repl. Directory imports are not supported.`,
    );
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  if (extension !== ".js" && extension !== ".mjs" && extension !== ".json") {
    throw new Error(
      `Unsupported import specifier "${specifier}" in node_repl. Only .js, .mjs, and JSON modules are supported.`,
    );
  }
  if (moduleContext.isPackage && !isWithinModuleSearchBases(resolvedPath)) {
    throw new Error(
      `Unsupported import specifier "${specifier}" in node_repl. Packages may only import files within configured node_modules roots.`,
    );
  }

  return { kind: "file", path: resolvedPath };
}

function resolveSpecifier(specifier, referrerIdentifier, moduleContext) {
  if (specifier.startsWith("node:") || builtinModuleSet.has(specifier)) {
    if (isDeniedBuiltin(specifier)) {
      throw new Error(
        `Importing module "${specifier}" is not allowed in node_repl`,
      );
    }
    return { kind: "builtin", specifier: toNodeBuiltinSpecifier(specifier) };
  }

  if (isPathSpecifier(specifier)) {
    return resolvePathSpecifier(specifier, referrerIdentifier, moduleContext);
  }

  if (!isBarePackageSpecifier(specifier)) {
    throw new Error(
      `Unsupported import specifier "${specifier}" in node_repl. Use a package name like "lodash" or "@scope/pkg", or a relative/absolute/file:// .js/.mjs path.`,
    );
  }

  const resolvedBare = resolveBareSpecifier(
    specifier,
    referrerIdentifier,
    moduleContext,
  );
  if (!resolvedBare) {
    throw new Error(`Module not found: ${specifier}`);
  }

  const adapter = hostNativePackageAdapters.get(specifier);
  if (resolvedBare.kind === "esm-package" && adapter && canonicalizePath(resolvedBare.path) === adapter.entry) {
    const metadataPath = findPackageJSON(pathToFileURL(resolvedBare.path).href);
    const metadata = metadataPath ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : null;
    if (metadata?.name === adapter.name && metadata.version === adapter.version) return { ...resolvedBare, kind: "package" };
  }
  return resolvedBare;
}

// DSH dependency adaptation: JSON remains data and requires Node import attributes.
function resolveSpecifierWithAttributes(specifier, referrerIdentifier, moduleContext, rawAttributes) {
  const resolved = resolveSpecifier(specifier, referrerIdentifier, moduleContext);
  const attributes = rawAttributes?.attributes ?? rawAttributes?.assert ?? rawAttributes ?? {};
  const unsupported = Object.keys(attributes).find((name) => name !== "type");
  if (unsupported) throw Object.assign(new TypeError("Unsupported import attribute: " + unsupported), { code: "ERR_IMPORT_ATTRIBUTE_UNSUPPORTED" });
  const json = resolved.path && path.extname(resolved.path).toLowerCase() === ".json";
  if (attributes.type !== undefined && attributes.type !== "json") throw Object.assign(new TypeError("Unsupported import attribute type: " + attributes.type), { code: "ERR_IMPORT_ATTRIBUTE_UNSUPPORTED" });
  if (json && attributes.type !== "json") throw Object.assign(new TypeError("JSON modules require an import attribute type: json"), { code: "ERR_IMPORT_ATTRIBUTE_MISSING" });
  if (!json && attributes.type === "json") throw Object.assign(new TypeError("The imported module is not a JSON module"), { code: "ERR_IMPORT_ATTRIBUTE_TYPE_INCOMPATIBLE" });
  return json ? { ...resolved, kind: "file" } : resolved;
}

function importNativeResolved(resolved) {
  if (resolved.kind === "builtin") {
    return import(resolved.specifier);
  }
  if (resolved.kind === "package") {
    return import(pathToFileURL(resolved.path).href);
  }
  throw new Error(`Unsupported module resolution kind: ${resolved.kind}`);
}

async function loadLinkedNativeModule(resolved, moduleContext) {
  const key =
    resolved.kind === "builtin"
      ? moduleCacheKey(moduleContext, `builtin:${resolved.specifier}`)
      : moduleCacheKey(moduleContext, `package:${resolved.path}`);
  let modulePromise = linkedNativeModules.get(key);
  if (!modulePromise) {
    modulePromise = (async () => {
      const namespace = await importNativeResolved(resolved);
      const exportNames = Object.getOwnPropertyNames(namespace);
      return new SyntheticModule(
        exportNames,
        function initSyntheticModule() {
          for (const name of exportNames) {
            this.setExport(name, namespace[name]);
          }
        },
        { context: moduleContext.context },
      );
    })();
    linkedNativeModules.set(key, modulePromise);
  }
  return modulePromise;
}

function getOrCreateLinkedFileModule(
  modulePath,
  moduleContext,
  createdFileModules,
) {
  const key = moduleCacheKey(moduleContext, modulePath);
  let module = linkedFileModules.get(key);
  if (!module) {
    const sourceBytes = fs.readFileSync(modulePath);
    const source = sourceBytes.toString("utf8");
    if (path.extname(modulePath).toLowerCase() === ".json") {
      const value = JSON.parse(source.replace(/^\uFEFF/, ""));
      module = new SyntheticModule(["default"], function initializeJsonModule() { this.setExport("default", value); }, { context: moduleContext.context, identifier: modulePath });
    } else module = new SourceTextModule(source, {
      context: moduleContext.context,
      identifier: modulePath,
      initializeImportMeta(meta, mod) {
        setImportMeta(meta, mod, moduleContext, false);
      },
      importModuleDynamically(specifier, referrer, importAttributes) {
        return importResolved(
          resolveSpecifierWithAttributes(specifier, referrer?.identifier, moduleContext, importAttributes),
          moduleContext,
        );
      },
    });
    linkedFileModules.set(key, module);
    linkedFileModuleContexts.set(module, moduleContext);
    createdFileModules.set(key, module);
  }

  return module;
}

async function loadLinkedFileModule(modulePath, moduleContext) {
  const previousLinking =
    linkedModuleLinkTails.get(moduleContext.context) ?? Promise.resolve();
  const linking = previousLinking.then(async () => {
    const createdFileModules = new Map();
    const module = getOrCreateLinkedFileModule(
      modulePath,
      moduleContext,
      createdFileModules,
    );
    try {
      if (module.status === "unlinked") {
        await module.link(async (specifier, referencingModule, importAttributes) => {
          const referencingModuleContext =
            linkedFileModuleContexts.get(referencingModule) ?? moduleContext;
          const resolved = resolveSpecifierWithAttributes(
            specifier,
            referencingModule?.identifier,
            referencingModuleContext,
            importAttributes,
          );
          return loadLinkedModule(
            resolved,
            referencingModuleContext,
            createdFileModules,
          );
        });
      }
      return module;
    } catch (error) {
      for (const [failedKey, failedModule] of createdFileModules) {
        if (linkedFileModules.get(failedKey) === failedModule) {
          linkedFileModules.delete(failedKey);
        }
      }
      throw error;
    }
  });
  linkedModuleLinkTails.set(
    moduleContext.context,
    linking.catch(() => undefined),
  );
  return linking;
}

async function loadLinkedModule(resolved, moduleContext, createdFileModules) {
  if (resolved.kind === "file" || resolved.kind === "esm-package") {
    const childModuleContext =
      resolved.kind === "esm-package" ? packageModuleContext : moduleContext;
    return getOrCreateLinkedFileModule(
      resolved.path,
      childModuleContext,
      createdFileModules,
    );
  }
  if (resolved.kind === "builtin" || resolved.kind === "package") {
    return loadLinkedNativeModule(resolved, moduleContext);
  }
  throw new Error(`Unsupported module resolution kind: ${resolved.kind}`);
}

async function importResolved(resolved, referrerModuleContext) {
  if (resolved.kind === "file" || resolved.kind === "esm-package") {
    const resolvedModuleContext =
      resolved.kind === "esm-package"
        ? packageModuleContext
        : referrerModuleContext;
    const module = await loadLinkedFileModule(
      resolved.path,
      resolvedModuleContext,
    );
    const key = moduleCacheKey(resolvedModuleContext, resolved.path);
    let evaluation = linkedModuleEvaluations.get(key);
    if (!evaluation) {
      evaluation = module.evaluate();
      linkedModuleEvaluations.set(key, evaluation);
    }
    await evaluation;
    return module.namespace;
  }
  return importNativeResolved(resolved);
}

function collectPatternNames(pattern, kind, map) {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      if (!map.has(pattern.name)) map.set(pattern.name, kind);
      return;
    case "ObjectPattern":
      for (const prop of pattern.properties ?? []) {
        if (prop.type === "Property") {
          collectPatternNames(prop.value, kind, map);
        } else if (prop.type === "RestElement") {
          collectPatternNames(prop.argument, kind, map);
        }
      }
      return;
    case "ArrayPattern":
      for (const elem of pattern.elements ?? []) {
        if (!elem) continue;
        if (elem.type === "RestElement") {
          collectPatternNames(elem.argument, kind, map);
        } else {
          collectPatternNames(elem, kind, map);
        }
      }
      return;
    case "AssignmentPattern":
      collectPatternNames(pattern.left, kind, map);
      return;
    case "RestElement":
      collectPatternNames(pattern.argument, kind, map);
      return;
    default:
      return;
  }
}

function collectBindings(ast) {
  const map = new Map();
  for (const stmt of ast.body ?? []) {
    if (stmt.type === "VariableDeclaration") {
      const kind = stmt.kind;
      for (const decl of stmt.declarations) {
        collectPatternNames(decl.id, kind, map);
      }
    } else if (stmt.type === "FunctionDeclaration" && stmt.id) {
      map.set(stmt.id.name, "function");
    } else if (stmt.type === "ClassDeclaration" && stmt.id) {
      map.set(stmt.id.name, "class");
    } else if (stmt.type === "ForStatement") {
      if (
        stmt.init &&
        stmt.init.type === "VariableDeclaration" &&
        stmt.init.kind === "var"
      ) {
        for (const decl of stmt.init.declarations) {
          collectPatternNames(decl.id, "var", map);
        }
      }
    } else if (
      stmt.type === "ForInStatement" ||
      stmt.type === "ForOfStatement"
    ) {
      if (
        stmt.left &&
        stmt.left.type === "VariableDeclaration" &&
        stmt.left.kind === "var"
      ) {
        for (const decl of stmt.left.declarations) {
          collectPatternNames(decl.id, "var", map);
        }
      }
    }
  }
  return Array.from(map.entries()).map(([name, kind]) => ({ name, kind }));
}

function collectReassignedConstNames(ast, priorBindings, currentBindingNames) {
  const priorConstNames = new Set(
    priorBindings
      .filter(
        (binding) =>
          binding.kind === "const" && !currentBindingNames.has(binding.name),
      )
      .map((binding) => binding.name),
  );
  const reassignedNames = new Set();

  const visit = (node, shadowedNames = new Set()) => {
    if (!node || typeof node !== "object" || typeof node.type !== "string") {
      return;
    }

    if (node.type === "BlockStatement") {
      const blockShadowedNames = new Set(shadowedNames);
      for (const statement of node.body ?? []) {
        if (
          statement.type === "VariableDeclaration" &&
          statement.kind !== "var"
        ) {
          for (const declaration of statement.declarations ?? []) {
            for (const name of collectPatternBindingNames(declaration.id)) {
              blockShadowedNames.add(name);
            }
          }
        } else if (
          (statement.type === "FunctionDeclaration" ||
            statement.type === "ClassDeclaration") &&
          statement.id
        ) {
          blockShadowedNames.add(statement.id.name);
        }
      }
      for (const statement of node.body ?? []) {
        visit(statement, blockShadowedNames);
      }
      return;
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      const functionShadowedNames = new Set(shadowedNames);
      if (node.id) {
        functionShadowedNames.add(node.id.name);
      }
      for (const parameter of node.params ?? []) {
        for (const name of collectPatternBindingNames(parameter)) {
          functionShadowedNames.add(name);
        }
      }
      visit(node.body, functionShadowedNames);
      return;
    }

    if (
      (node.type === "ForInStatement" || node.type === "ForOfStatement") &&
      node.left?.type === "VariableDeclaration" &&
      node.left.kind !== "var"
    ) {
      const loopShadowedNames = new Set(shadowedNames);
      for (const declaration of node.left.declarations ?? []) {
        for (const name of collectPatternBindingNames(declaration.id)) {
          loopShadowedNames.add(name);
        }
      }
      visit(node.right, shadowedNames);
      visit(node.left, loopShadowedNames);
      visit(node.body, loopShadowedNames);
      return;
    }

    const target =
      node.type === "AssignmentExpression" ||
      ((node.type === "ForInStatement" || node.type === "ForOfStatement") &&
        node.left?.type !== "VariableDeclaration")
        ? node.left
        : node.type === "UpdateExpression"
          ? node.argument
          : null;

    for (const name of collectPatternBindingNames(target)) {
      if (priorConstNames.has(name) && !shadowedNames.has(name)) {
        reassignedNames.add(name);
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          visit(child, shadowedNames);
        }
      } else {
        visit(value, shadowedNames);
      }
    }
  };

  visit(ast);

  return reassignedNames;
}

function collectPatternBindingNames(pattern) {
  const map = new Map();
  collectPatternNames(pattern, "binding", map);
  return Array.from(map.keys());
}

function nextInternalBindingName() {
  // We intentionally do not scan user-declared names here. Internal helpers use
  // a per-thread salt plus a counter instead. A user could still collide by
  // deliberately spelling the exact generated name, but the thread-id salt
  // keeps accidental collisions negligible while avoiding more AST bookkeeping.
  return `__codex_internal_commit_${internalBindingSalt}_${internalBindingCounter++}`;
}

function buildMarkCommittedExpression(names, markCommittedFnName) {
  const serializedNames = names.map((name) => JSON.stringify(name)).join(", ");
  return `(${markCommittedFnName}(${serializedNames}), undefined)`;
}

function tryReadBindingValue(module, bindingName) {
  if (!module) {
    return { ok: false, value: undefined };
  }

  try {
    return { ok: true, value: module.namespace[bindingName] };
  } catch {
    return { ok: false, value: undefined };
  }
}

function instrumentVariableDeclarationSource(
  code,
  declaration,
  markCommittedFnName,
) {
  if (!declaration.declarations?.length) {
    return code.slice(declaration.start, declaration.end);
  }

  const prefix = code.slice(
    declaration.start,
    declaration.declarations[0].start,
  );
  const suffix = code.slice(
    declaration.declarations[declaration.declarations.length - 1].end,
    declaration.end,
  );
  const parts = [];

  for (const decl of declaration.declarations) {
    parts.push(code.slice(decl.start, decl.end));

    const names = collectPatternBindingNames(decl.id);
    if (names.length > 0) {
      const helperName = nextInternalBindingName();
      parts.push(
        `${helperName} = ${buildMarkCommittedExpression(names, markCommittedFnName)}`,
      );
    }
  }

  return `${prefix}${parts.join(", ")}${suffix}`;
}

function instrumentLoopBody(code, body, names, guardName, markCommittedFnName) {
  const marker = `if (${guardName}) { ${guardName} = false; ${markCommittedFnName}(${names
    .map((name) => JSON.stringify(name))
    .join(", ")}); }`;
  const bodyCode = code.slice(body.start, body.end);

  if (body.type === "BlockStatement") {
    return `{ ${marker}${bodyCode.slice(1)}`;
  }

  return `{ ${marker} ${bodyCode} }`;
}

function applyReplacements(code, replacements) {
  let instrumentedCode = code;

  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    instrumentedCode =
      instrumentedCode.slice(0, replacement.start) +
      replacement.text +
      instrumentedCode.slice(replacement.end);
  }

  return instrumentedCode;
}

function collectHoistedVarDeclarationStarts(ast) {
  const varDeclarationStarts = new Map();

  const recordDeclarationStart = (map, name, start) => {
    const existingStart = map.get(name);
    if (existingStart === undefined || start < existingStart) {
      map.set(name, start);
    }
  };

  const recordVarDeclarationStarts = (declaration) => {
    for (const name of collectPatternBindingNames(declaration.id)) {
      recordDeclarationStart(varDeclarationStarts, name, declaration.start);
    }
  };

  for (const stmt of ast.body ?? []) {
    if (stmt.type === "VariableDeclaration" && stmt.kind === "var") {
      for (const declaration of stmt.declarations ?? []) {
        recordVarDeclarationStarts(declaration);
      }
      continue;
    }

    if (
      stmt.type === "ForStatement" &&
      stmt.init?.type === "VariableDeclaration" &&
      stmt.init.kind === "var"
    ) {
      for (const declaration of stmt.init.declarations ?? []) {
        recordVarDeclarationStarts(declaration);
      }
      continue;
    }

    if (
      (stmt.type === "ForInStatement" || stmt.type === "ForOfStatement") &&
      stmt.left?.type === "VariableDeclaration" &&
      stmt.left.kind === "var"
    ) {
      for (const declaration of stmt.left.declarations ?? []) {
        recordVarDeclarationStarts(declaration);
      }
    }
  }

  return varDeclarationStarts;
}

function collectFutureVarWriteReplacements(
  code,
  ast,
  { helperDeclarations = null, markCommittedFnName = null } = {},
) {
  // Failed-cell hoisted tracking intentionally stays small here. We only mark
  // direct top-level writes to future `var` bindings, plus top-level
  // declaration-site markers handled later in `instrumentCurrentBindings`.
  // We do not recurse through nested statement structure because that quickly
  // requires real lexical-scope tracking for blocks, loop scopes, catch
  // bindings, and similar shadowing cases. Supported write recovery is limited
  // to direct top-level expression statements such as `x = 1`, `x += 1`,
  // `x++`, and logical assignments.
  const varDeclarationStarts = collectHoistedVarDeclarationStarts(ast);
  if (varDeclarationStarts.size === 0) {
    return [];
  }
  const replacements = [];
  const replacementKeys = new Set();

  if (!markCommittedFnName) {
    throw new Error(
      "collectFutureVarWriteReplacements expected a commit marker binding name",
    );
  }

  const addReplacement = (start, end, text) => {
    const key = `${start}:${end}`;
    if (!replacementKeys.has(key)) {
      replacementKeys.add(key);
      replacements.push({ start, end, text });
    }
  };

  const getFutureVarName = (identifier) => {
    if (!identifier || identifier.type !== "Identifier") {
      return null;
    }

    const declarationStart = varDeclarationStarts.get(identifier.name);
    if (
      declarationStart === undefined ||
      identifier.start >= declarationStart
    ) {
      return null;
    }

    return identifier.name;
  };

  const instrumentUpdateExpression = (node, identifier) => {
    const bindingName = getFutureVarName(identifier);
    if (!bindingName) {
      return false;
    }

    addReplacement(
      node.start,
      node.end,
      `(${markCommittedFnName}(${JSON.stringify(bindingName)}), ${code.slice(
        node.start,
        node.end,
      )})`,
    );
    return true;
  };

  const instrumentAssignmentExpression = (node) => {
    if (node.left.type !== "Identifier") {
      return false;
    }

    const bindingName = getFutureVarName(node.left);
    if (!bindingName) {
      return false;
    }

    if (
      node.operator === "&&=" ||
      node.operator === "||=" ||
      node.operator === "??="
    ) {
      if (!helperDeclarations) {
        throw new Error(
          "collectFutureVarWriteReplacements expected helperDeclarations for logical assignment rewriting",
        );
      }

      const helperName = nextInternalBindingName();
      helperDeclarations.push(`let ${helperName};`);
      const shortCircuitOperator =
        node.operator === "&&=" ? "&&" : node.operator === "||=" ? "||" : "??";
      addReplacement(
        node.start,
        node.end,
        `((${helperName} = ${node.left.name}), ${helperName} ${shortCircuitOperator} ((${node.left.name} = ${code.slice(node.right.start, node.right.end)}), ${buildMarkCommittedExpression([bindingName], markCommittedFnName)}, ${node.left.name}))`,
      );
      return true;
    }

    addReplacement(
      node.start,
      node.end,
      `((${code.slice(node.start, node.end)}), ${buildMarkCommittedExpression([bindingName], markCommittedFnName)}, ${node.left.name})`,
    );
    return true;
  };

  const unwrapParenthesizedExpression = (node) => {
    let current = node;
    while (current?.type === "ParenthesizedExpression") {
      current = current.expression;
    }
    return current;
  };

  for (const statement of ast.body ?? []) {
    if (statement.type !== "ExpressionStatement") {
      continue;
    }

    const expression = unwrapParenthesizedExpression(statement.expression);
    if (!expression) {
      continue;
    }

    if (
      expression.type === "UpdateExpression" &&
      expression.argument.type === "Identifier"
    ) {
      instrumentUpdateExpression(expression, expression.argument);
      continue;
    }

    if (expression.type === "AssignmentExpression") {
      instrumentAssignmentExpression(expression);
    }
  }

  return replacements;
}

function instrumentCurrentBindings(
  code,
  ast,
  currentBindings,
  priorBindings,
  markCommittedFnName,
) {
  if (currentBindings.length === 0) {
    return code;
  }

  const replacements = [];

  for (const stmt of ast.body ?? []) {
    if (stmt.type === "VariableDeclaration") {
      replacements.push({
        start: stmt.start,
        end: stmt.end,
        text: instrumentVariableDeclarationSource(
          code,
          stmt,
          markCommittedFnName,
        ),
      });
      continue;
    }

    if (stmt.type === "FunctionDeclaration" && stmt.id) {
      replacements.push({
        start: stmt.start,
        end: stmt.end,
        // Keep function source text stable for things like `foo.toString()`.
        // Pre-declaration uses are tracked separately by instrumenting the
        // top-level expressions that actually read the hoisted function value.
        text: `${code.slice(stmt.start, stmt.end)}\n;${markCommittedFnName}(${JSON.stringify(stmt.id.name)});`,
      });
      continue;
    }

    if (stmt.type === "ClassDeclaration" && stmt.id) {
      replacements.push({
        start: stmt.start,
        end: stmt.end,
        text: `${code.slice(stmt.start, stmt.end)}\n;${markCommittedFnName}(${JSON.stringify(stmt.id.name)});`,
      });
      continue;
    }

    if (
      stmt.type === "ForStatement" &&
      stmt.init &&
      stmt.init.type === "VariableDeclaration" &&
      stmt.init.kind === "var"
    ) {
      replacements.push({
        start: stmt.start,
        end: stmt.end,
        text: `${code.slice(stmt.start, stmt.init.start)}${instrumentVariableDeclarationSource(
          code,
          stmt.init,
          markCommittedFnName,
        )}${code.slice(stmt.init.end, stmt.end)}`,
      });
      continue;
    }

    if (
      (stmt.type === "ForInStatement" || stmt.type === "ForOfStatement") &&
      stmt.left &&
      stmt.left.type === "VariableDeclaration" &&
      stmt.left.kind === "var"
    ) {
      const names = stmt.left.declarations.flatMap((decl) =>
        collectPatternBindingNames(decl.id),
      );
      if (names.length > 0) {
        const guardName = nextInternalBindingName();
        replacements.push({
          start: stmt.start,
          end: stmt.end,
          // Mark top-level `for...in` / `for...of` vars on the first body
          // execution instead of every iteration. This keeps hot loops cheap
          // after the first pass while still preserving vars for the common
          // case where the loop actually ran before a later throw.
          //
          // The tradeoff is that `for (var x of []) {}` in a failed cell will
          // not carry `x` forward as `undefined`, because the body never runs
          // and the one-time marker never fires. We accept that edge case:
          // `var` is redeclarable, and the only lost state is an unassigned
          // `undefined` from an empty top-level loop in a cell that later
          // fails.
          text: `let ${guardName} = true;\n${code.slice(
            stmt.start,
            stmt.body.start,
          )}${instrumentLoopBody(
            code,
            stmt.body,
            names,
            guardName,
            markCommittedFnName,
          )}`,
        });
      }
    }
  }

  return applyReplacements(code, replacements);
}

async function buildModuleSource(code) {
  const meriyah = await meriyahPromise;
  const diagnosticTokens = [];
  const diagnosticComments = [];
  const ast = meriyah.parseModule(code, {
    next: true,
    module: true,
    ranges: true,
    loc: false,
    disableWebCompat: true,
    onToken: diagnosticTokens,
    onComment(_kind, _value, start, end) {
      diagnosticComments.push({ start, end });
    },
  });
  const currentBindings = collectBindings(ast);
  const priorBindings = previousModule ? previousBindings : [];
  const currentBindingNames = new Set(
    currentBindings.map((binding) => binding.name),
  );
  const reassignedConstNames = collectReassignedConstNames(
    ast,
    priorBindings,
    currentBindingNames,
  );
  const warnedConstNames = new Set(reassignedConstNames);
  for (const binding of currentBindings) {
    if (
      binding.kind === "const" &&
      priorBindings.some(
        (prior) => prior.name === binding.name && prior.kind === "const",
      )
    ) {
      warnedConstNames.add(binding.name);
    }
  }
  const carriedBindings = priorBindings.filter(
    (binding) => !currentBindingNames.has(binding.name),
  );
  const redactedSource = redactDiagnosticSource(
    code,
    ast,
    currentBindings,
    priorBindings,
    diagnosticTokens,
    diagnosticComments,
    collectPatternBindingNames,
  );
  const helperDeclarations = [];
  const markCommittedFnName = nextInternalBindingName();
  const markPreludeCompletedFnName = nextInternalBindingName();
  helperDeclarations.push(
    // `import.meta` is syntax-level and cannot be shadowed by user bindings
    // like `const globalThis = ...`, so alias the marker helper through it
    // once in the prelude and use that stable local binding everywhere.
    // Then delete the raw import.meta hooks so user code cannot spoof
    // committed bindings by calling them directly.
    `const ${markCommittedFnName} = import.meta.__codexInternalMarkCommittedBindings;`,
    `const ${markPreludeCompletedFnName} = import.meta.__codexInternalMarkPreludeCompleted;`,
    "delete import.meta.__codexInternalMarkCommittedBindings;",
    "delete import.meta.__codexInternalMarkPreludeCompleted;",
  );
  const writeInstrumentedCode = applyReplacements(
    code,
    collectFutureVarWriteReplacements(code, ast, {
      helperDeclarations,
      markCommittedFnName,
    }),
  );
  const instrumentedAst = meriyah.parseModule(writeInstrumentedCode, {
    next: true,
    module: true,
    ranges: true,
    loc: false,
    disableWebCompat: true,
  });
  const instrumentedCode = instrumentCurrentBindings(
    writeInstrumentedCode,
    instrumentedAst,
    currentBindings,
    priorBindings,
    markCommittedFnName,
  );

  let prelude = "";
  if (previousModule && carriedBindings.length) {
    // Recreate carried bindings before running user code in this new cell.
    prelude += 'import * as __prev from "@prev";\n';
    prelude += carriedBindings
      .map((b) => {
        let keyword = "let";
        if (b.kind === "var") {
          keyword = "var";
        } else if (b.kind === "const" && !reassignedConstNames.has(b.name)) {
          keyword = "const";
        }
        return `${keyword} ${b.name} = __prev.${b.name};`;
      })
      .join("\n");
    prelude += "\n";
  }
  if (helperDeclarations.length > 0) {
    prelude += `${helperDeclarations.join("\n")}\n`;
  }
  prelude += `${markPreludeCompletedFnName}();\n`;

  const mergedBindings = new Map();
  for (const binding of priorBindings) {
    mergedBindings.set(binding.name, binding.kind);
  }
  for (const binding of currentBindings) {
    mergedBindings.set(binding.name, binding.kind);
  }
  // Export the merged binding set so the next cell can import it through @prev.
  const exportNames = Array.from(mergedBindings.keys());
  const exportStmt = exportNames.length
    ? `\nexport { ${exportNames.join(", ")} };`
    : "";

  const nextBindings = Array.from(mergedBindings, ([name, kind]) => ({
    name,
    kind,
  }));
  return {
    source: `${prelude}${instrumentedCode}${exportStmt}`,
    redactedSource,
    currentBindings,
    nextBindings,
    priorBindings,
    warnedConstNames,
  };
}

function canReadCommittedBinding(module, binding) {
  if (!module || binding.kind === "var" || binding.kind === "function") {
    return false;
  }

  return tryReadBindingValue(module, binding.name).ok;
}
// Failed cells keep prior bindings plus the current-cell bindings whose
// initialization definitely ran before the throw. That means:
// - lexical bindings (`const` / `let` / `class`) can fall back to namespace
//   readability, which preserves names whose initialization already completed
//   even when a later step in the same declarator throws
// - `var` / `function` bindings only persist when an explicit declaration-site
//   or write-site marker fired, so unreached hoisted bindings do not become
//   ghost bindings in later cells
function collectCommittedBindings(
  module,
  priorBindings,
  currentBindings,
  committedCurrentBindingNames,
) {
  const mergedBindings = new Map();
  let committedCurrentBindingCount = 0;

  for (const binding of priorBindings) {
    mergedBindings.set(binding.name, binding.kind);
  }

  for (const binding of currentBindings) {
    if (
      committedCurrentBindingNames.has(binding.name) ||
      canReadCommittedBinding(module, binding)
    ) {
      mergedBindings.set(binding.name, binding.kind);
      committedCurrentBindingCount += 1;
    }
  }

  return {
    bindings: Array.from(mergedBindings, ([name, kind]) => ({ name, kind })),
    committedCurrentBindingCount,
  };
}

function formatErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error) {
    return error.message ? String(error.message) : String(error);
  }
  return String(error);
}

function sendFatalExecResultSync(kind, error) {
  if (!execContext.activeId) {
    return;
  }
  const payload = {
    type: "exec_result",
    id: execContext.activeId,
    ok: false,
    output: "",
    error: `node_repl kernel ${kind}: ${formatErrorMessage(error)}; kernel reset. Catch or handle async errors (including Promise rejections and EventEmitter 'error' events) to avoid kernel termination.`,
  };
  try {
    fs.writeSync(process.stdout.fd, `${JSON.stringify(payload)}\n`);
  } catch {
    // Best effort only; the host will still surface stdout EOF diagnostics.
  }
}

function scheduleFatalExit(kind, error) {
  if (fatalExitScheduled) {
    process.exitCode = 1;
    return;
  }
  fatalExitScheduled = true;
  sendFatalExecResultSync(kind, error);

  try {
    fs.writeSync(
      process.stderr.fd,
      `node_repl kernel ${kind}: ${formatErrorMessage(error)}\n`,
    );
  } catch {
    // ignore
  }

  // The host will observe stdout EOF, reset kernel state, and restart on demand.
  setImmediate(() => {
    process.exit(1);
  });
}

function renderOutputEvents(outputEvents) {
  let output = "";
  let lastDefaultKind;
  const named = new Map();
  for (const event of outputEvents) {
    if (event.item_id !== undefined) {
      named.set(event.item_id, (named.get(event.item_id) ?? "") + event.text);
      continue;
    }
    output += event.text;
    if (event.kind === "line") {
      output += "\n";
    }
    lastDefaultKind = event.kind;
  }
  if (lastDefaultKind === "line" && output.endsWith("\n")) {
    output = output.slice(0, -1);
  }
  return { output, named_outputs: [...named.values()] };
}

function withCapturedConsole(ctx, fn) {
  const original = ctx.console ?? console;
  ctx.console = runtime.createConsole(original);
  return fn().finally(() => {
    ctx.console = original;
  });
}

async function runAfterSubmittedCode(execState) {
  send({
    type: "submitted_code_complete",
    exec_id: execState.id,
    execution_duration_ms: execState.submittedCodeExecutionMs,
  });

}

function requestTrustedWorker(execState, type, payload, timeoutMs) {
  const id = `${execState.id}-trusted-rpc-${trustedServiceRequestCounter++}`;
  return new Promise((resolve, reject) => {
    let timeout;
    pendingRequests.set(id, (response) => {
      clearTimeout(timeout);
      for (const output of response.output ?? []) {
        execState.outputEvents.push(output);
      }
      execState.contentItems.push(...(response.content_items ?? []));
      if (!response.ok) {
        reject(new Error(response.error || "Trusted RPC request failed"));
        return;
      }
      resolve(response.value);
    });
    if (timeoutMs !== undefined) {
      // Settle the original promise tracked by the execution's background drain.
      timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`nodeRepl.rpc timed out after ${timeoutMs}ms`));
        try {
          send({ type: "trusted_service_cancel", id });
        } catch {
          // The request is already rejected if the supervisor is unavailable.
        }
      }, timeoutMs);
    }
    try {
      send({ type, id, exec_id: execState.id, ...payload });
    } catch (error) {
      clearTimeout(timeout);
      pendingRequests.delete(id);
      reject(error);
    }
  });
}

defineLockedGlobal(runtimeContext, "tmpDir", tmpDir);

async function handleExec(message) {
  clearLocalFileModuleCaches();
  execContext.activate(message.id);
  const execState = runtime.createExecState(message, {
    submittedCodeExecutionMs: null,
  });
  if (message.pendingBackgroundTasks) execState.pendingBackgroundTasks = message.pendingBackgroundTasks;

  let module = null;
  /** @type {Binding[]} */
  let currentBindings = [];
  /** @type {Binding[]} */
  let nextBindings = [];
  /** @type {Binding[]} */
  let priorBindings = previousBindings;
  let moduleLinked = false;
  let preludeCompleted = false;
  const committedCurrentBindingNames = new Set();
  const markCommittedBindings = (...names) => {
    for (const name of names) {
      committedCurrentBindingNames.add(name);
    }
  };
  const markPreludeCompleted = () => {
    preludeCompleted = true;
  };

  try {
    const code = typeof message.code === "string" ? message.code : "";
    const builtSource = await buildModuleSource(code);
    const banner =
      !jsBannerExecuted && jsBanner?.trim()
        ? `await (async () => {\n${jsBanner}\n})();\nimport.meta.__codexInternalMarkBannerExecuted();\n`
        : "";
    const source = `${banner}${builtSource.source}`;
    currentBindings = builtSource.currentBindings;
    nextBindings = builtSource.nextBindings;
    priorBindings = builtSource.priorBindings;
    send({
      type: "exec_redacted_source",
      id: message.id,
      source: builtSource.redactedSource,
    });
    // AsyncLocalStorage keeps the current tool-call state available to helper
    // methods and async callbacks without exposing mutable host bookkeeping.
    await execContext.run(execState, async () => {
      await withCapturedConsole(runtimeContext, async () => {
        const cellIdentifier = path.join(
          cwd,
          `.node_repl_cell_${cellCounter++}.mjs`,
        );
        module = new SourceTextModule(source, {
          context: runtimeContext,
          identifier: cellIdentifier,
          initializeImportMeta(meta, mod) {
            setImportMeta(meta, mod, moduleContext, true);
            meta.__codexInternalMarkCommittedBindings = markCommittedBindings;
            meta.__codexInternalMarkPreludeCompleted = markPreludeCompleted;
            if (banner) {
              meta.__codexInternalMarkBannerExecuted = () => {
                jsBannerExecuted = true;
                delete meta.__codexInternalMarkBannerExecuted;
              };
            }
          },
          importModuleDynamically(specifier, referrer, importAttributes) {
            return importResolved(
              resolveSpecifierWithAttributes(specifier, referrer?.identifier, moduleContext, importAttributes),
              moduleContext,
            );
          },
        });

        await module.link(async (specifier) => {
          if (specifier === "@prev" && previousModule) {
            const exportNames = previousBindings.map((b) => b.name);
            // Build a synthetic module snapshot of the prior cell's exports.
            // This is the bridge that carries values from cell N to cell N+1.
            const synthetic = new SyntheticModule(
              exportNames,
              function initSynthetic() {
                for (const binding of previousBindings) {
                  this.setExport(
                    binding.name,
                    previousModule.namespace[binding.name],
                  );
                }
              },
              { context: runtimeContext },
            );
            return synthetic;
          }
          throw new Error(
            `Top-level static import "${specifier}" is not supported in node_repl. Use await import("${specifier}") instead.`,
          );
        });
        moduleLinked = true;

        const submittedCodeStartedAtMs = performance.now();
        try {
          for (const name of builtSource.warnedConstNames) {
            runtimeContext.console.warn(
              `Warning: ${name} was declared with const; use let for reassignable variables.`,
            );
          }
          await module.evaluate();
        } finally {
          execState.submittedCodeExecutionMs = Math.round(
            performance.now() - submittedCodeStartedAtMs,
          );
        }
        await drainExecBackgroundTasks(execState);
        await runAfterSubmittedCode(execState);
      });
    });

    previousModule = module;
    previousBindings = nextBindings;
    send({
      type: "exec_result",
      content_items: execState.contentItems,
      id: message.id,
      ok: true,
      ...renderOutputEvents(execState.outputEvents),
      error: null,
    });
  } catch (error) {
    // An error skips the happy-path drain. Let tracked submitted-code work
    // settle before ending its timeout phase.
    try {
      await drainExecBackgroundTasks(execState);
    } catch {}
    // The execution context and console capture unwound with the error. Restore
    // them so trusted service hooks run and keep console output captured.
    await execContext.run(execState, () =>
      withCapturedConsole(runtimeContext, () =>
        runAfterSubmittedCode(execState),
      ),
    );
    const { bindings: committedBindings, committedCurrentBindingCount } =
      collectCommittedBindings(
        moduleLinked ? module : null,
        priorBindings,
        currentBindings,
        committedCurrentBindingNames,
      );
    // Preserve the last successfully linked module across link-time failures.
    // A module whose link step failed cannot safely back @prev because reading
    // its namespace throws before evaluation ever begins. Likewise, if a
    // linked module failed before its prelude recreated carried bindings, keep
    // the old module so @prev still points at the last cell whose prelude and
    // body actually established the carried values. Once the prelude has run,
    // promote the failed module even if it only updated existing bindings.
    if (
      module &&
      moduleLinked &&
      (committedCurrentBindingCount > 0 ||
        (preludeCompleted && priorBindings.length > 0))
    ) {
      const shadowedUncommittedBindings = new Set(
        currentBindings
          .filter(
            (binding) =>
              priorBindings.some((prior) => prior.name === binding.name) &&
              !committedCurrentBindingNames.has(binding.name) &&
              !canReadCommittedBinding(module, binding),
          )
          .map((binding) => binding.name),
      );

      if (shadowedUncommittedBindings.size > 0) {
        const priorModule = previousModule;
        const recoveredModule = new SyntheticModule(
          committedBindings.map((binding) => binding.name),
          function initSynthetic() {
            for (const binding of committedBindings) {
              this.setExport(
                binding.name,
                shadowedUncommittedBindings.has(binding.name)
                  ? priorModule.namespace[binding.name]
                  : module.namespace[binding.name],
              );
            }
          },
          { context: runtimeContext },
        );
        await recoveredModule.link(() => {
          throw new Error("Recovered REPL bindings must not import modules");
        });
        await recoveredModule.evaluate();
        previousModule = recoveredModule;
      } else {
        previousModule = module;
      }
      previousBindings = committedBindings;
    }
    send({
      type: "exec_result",
      content_items: execState.contentItems,
      id: message.id,
      ok: false,
      ...renderOutputEvents(execState.outputEvents),
      error: error && error.message ? error.message : String(error),
    });
  } finally {
    execContext.clear(message.id);
  }
}

let initialized = false;
module.exports = {
  initialize(globals, onConsoleEvent, options = {}) {
    if (initialized) throw new Error("Computer Use kernel is already initialized.");
    if (typeof SourceTextModule !== "function") throw new Error("Computer Use requires Node VM module support.");
    for (const [name, value] of Object.entries(globals)) {
      if (name === "console") runtimeContext.console = value;
      else defineLockedGlobal(runtimeContext, name, value);
    }
    for (const directory of options.moduleSearchDirectories ?? []) addModuleSearchBase(directory);
    for (const adapter of options.nativePackageAdapters ?? []) hostNativePackageAdapters.set(adapter.specifier, { ...adapter, entry: canonicalizePath(adapter.entry) });
    if (onConsoleEvent) emitConsoleEvent = onConsoleEvent;
    initialized = true;
  },
  async execute(message) {
    if (!initialized) throw new Error("Computer Use kernel is not initialized.");
    let result;
    emitKernelMessage = (event) => { if (event.type === "exec_result") result = event; };
    try { await handleExec(message); }
    finally { emitKernelMessage = () => {}; }
    if (!result) throw new Error("Computer Use kernel did not return a result.");
    return result;
  },
};
