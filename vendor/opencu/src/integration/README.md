# Browser provider composition

`browser.mjs` composes the independently implemented Playwright and extension backends into the controller's browser inventory. Targets retain their real provider and occurrence identity; extension navigation requires explicit reselection, and disconnected input release is not treated as confirmed.

`src/runtime.mjs` creates the composite and controller. `src/dsh/runtime.mjs` owns the controller and, where enabled, the extension-only loopback bridge. No external service or standalone page is required. The plugin's bridge owns its random port and private connection configuration; it closes only after successful input release and backend shutdown.

Extension download events are browser-wide metadata, not local deliverable files. They remain metadata-only until explicitly imported and validated.
