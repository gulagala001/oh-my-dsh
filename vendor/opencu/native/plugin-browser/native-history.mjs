// Compatibility names now refer to the plugin's owned SQLite service.
// An absolute owned database path is required; Electron Session is not a history provider.
export {BrowserHistory, BrowserHistory as NativeBrowserHistory,
  BrowserHistory as OwnedBrowserHistory} from './history.mjs';
