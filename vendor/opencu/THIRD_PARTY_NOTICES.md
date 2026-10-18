# Third-party components

OpenCU's new control core and backends are independent implementations. Original Codex frontend assets were obtained through REA 6.1.0 from Codex 26.1007.21159, build 20052; source identity and SHA-256 records are retained in src/client/rea/provenance.json in the source repository. Extracted frontend code retains the original implementation and applicable upstream rights; extraction does not grant a new license to proprietary assets.

The frontend uses React and React DOM 19.2.7 and React Compiler Runtime 1.0.0 (MIT). Playwright 1.63.0 is Apache-2.0. Sharp 0.35.5 is Apache-2.0; its binary dependencies retain their upstream licenses. Chromium is installed separately into Playwright's cache and is not bundled with the plugin. DSH and Cordis are host-provided peer dependencies; their original license terms remain applicable.

The DSH browser-extension host adapter uses electron-chrome-extensions 4.9.0 under its GPL-3.0 license option for local development and evaluation. Its unmodified package retains LICENSE.md and the actual extension API preload. Distribution of a combined host requires compliance with that license or a separately obtained commercial license; this local integration does not grant either proprietary REA redistribution rights or a commercial extension-library license.

The standalone browser keyboard ownership preflight includes the complete keyboard layout and layout builder from Microsoft Playwright 1.63.0 (`usKeyboardLayout.ts` and `input.ts`), Copyright (c) Microsoft Corporation, Apache-2.0. The added ownership lookup is OpenCU-specific. The license is included in `docs/licenses/playwright-keyboard.txt`.
