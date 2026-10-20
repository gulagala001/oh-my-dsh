# Desktop host

[简体中文](desktop-host.md) · [Home](../README_EN.md)

This release targets **DSH 0.2.1-rc.2** and **Cordis 4.0.5**. The plugin supplies its UI; the companion host bridge supplies Electron capabilities. Embedded use requires both.

## Required capabilities

The host must expose `window.dshDesktop.browser` with isolated-page acquisition and release; standard rc.2 desktop already supplies these interfaces and page reading. The companion source adapter adds persistent profiles, restricted website downloads and extended platform pages. The plugin checks actual capabilities and explains unavailable features with an external-browser entry point. Reusing current API Platform authorization also requires `window.dshPlatform`.

Installing the plugin in standard DSH does not modify the Electron main process, preloads or a signed application. Custom desktop distributors must apply the matching adapter in their own DSH rc.2 source copy, rebuild affected Host, Client, Web, desktop main and preload outputs, and package and sign using upstream platform workflows. The source entry point is `desktop/apply-host.mjs`; it checks real source and anchors and rejects incompatible inputs.

## Sessions and security

With the companion adapter, website chat and the API Platform use a persistent Chromium profile managed by the host. Releasing a page does not clear login storage. Sign out through the website's own controls.

Navigation is restricted to official DeepSeek chat and platform pages. Required login and captcha resources follow explicit host policy. Chromium sandboxing, web security and context isolation remain enabled; Node integration stays disabled. Uploads use the manual file picker. Downloads require approved origins and redirects and a native save dialog.

Temporary chat cleanup operates on its own website conversation and completes before closing. Releasing an ordinary page only releases browser resources; its website conversation remains in history.

## Compatibility

| Environment | Behavior |
| --- | --- |
| DSH rc.2 desktop with companion bridge | Embedded chat, temporary sidebar, website migration and platform entry points |
| Standard DSH rc.2 desktop | Embedded chat, temporary sidebar and website migration; process-scoped sign-in and no website downloads |
| DSH rc.2 browser UI | Website embedding and cross-origin restrictions apply; external entry point available |

Desktop distributions for macOS, Windows and Linux each require a matching host build and platform verification. Checks on one platform or in isolation do not establish native validation on every platform.
