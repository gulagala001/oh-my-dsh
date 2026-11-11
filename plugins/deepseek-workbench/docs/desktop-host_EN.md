# DeepSeek Workbench desktop adaptation

[简体中文](desktop-host.md) · [Back to README](../README_EN.md)

With just the plugin installed, the standard DSH desktop app gives you web chat, the temporary sidebar and Continue in DSH. The following three need a matching adaptation applied to the DSH desktop source, which you then build yourself:

- DeepSeek and API platform sign-in that survives restarts.
- Downloading files from DeepSeek chats.
- The API Keys platform page embedded in DSH.

The adaptation script is `desktop/apply-host.mjs`, and it currently accepts only **DSH 0.2.1-rc.2** source. Build steps are in [desktop/README_EN.md](../desktop/README_EN.md).

## What works where

| Environment | What works |
| --- | --- |
| DSH desktop with the adaptation | Web chat, temporary sidebar, Continue in DSH and the platform page, with sign-in kept across restarts and DeepSeek downloads |
| Standard DSH desktop | Web chat, temporary sidebar and Continue in DSH. You sign in again after each restart, and DeepSeek downloads are unavailable |
| DSH in a browser | DeepSeek's embedding restrictions limit it to an external browser |

The plugin checks what the current DSH can do. When something is missing, the panel says so and offers an external browser link.

## Sign-in and security

With the adaptation, DeepSeek chat and the API platform use a separately stored browser profile, so closing the page does not sign you out. To sign out, use DeepSeek's own sign-out button.

Pages can only open DeepSeek's official chat and platform addresses. The browser sandbox stays on, and web pages get no access to local Node features. Uploads require you to pick files by hand; downloads are checked for their origin and confirmed in the system save dialog.

macOS, Windows and Linux each need their own build and signing.
