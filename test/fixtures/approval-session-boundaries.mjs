// Synthetic boundaries only. shared/runtime/app-approvals and target matching remain production code.
export const controllers = new Map();
const closedService = () => ({ close: async () => {} });
const unused = () => { throw new Error('Unexpected synthetic boundary call'); };
export const Context = { is: () => false, isolate: Symbol('synthetic-isolate') };
export const createScope = unused, scopeOf = unused, installToolDefinitions = unused;
export const createComputerSession = unused;
export const createActivityFeed = () => ({ begin: () => ({}), finish() {}, sessionEvent() {}, forget() {}, close() {} });
export const createBrowserHost = () => ({ backend: {}, listBrowsers: () => [], close() {} });
export const createPresentationHost = closedService;
export const createPreferences = closedService, createBrowserHistory = closedService;
export const createBrowserResources = closedService, createSidebarDownloads = closedService, createDeliveryFiles = closedService;
export const createImageRegistry = () => ({ ready: async () => {}, close: async () => {} });
export const createBrowserPairing = unused, listenExtension = unused;
export const modelResult = value => value;
export async function createRuntime(config) {
  const controller = controllers.get(config.dataDir);
  if (!controller) throw new Error('Synthetic controller was not registered');
  return controller;
}
export const DEFAULT_DATA_DIR = '/synthetic-unused-data';
const schema = new Proxy(() => schema, { get: () => schema });
export default schema;
