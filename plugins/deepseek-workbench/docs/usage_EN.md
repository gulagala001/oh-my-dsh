# User guide

[简体中文](usage.md) · [Home](../README_EN.md)

## Ordinary web chat

Open **DeepSeek web chat** from the left sidebar to use chat in the main content area. Sign into `chat.deepseek.com` on first use. Chat login is separate from DSH API Platform authorization. Select website history or start a new conversation, then send messages, upload attachments and toggle DeepThink or Search.

Ordinary conversations remain in website history. Read panel errors and retry failed operations; a failed send retains its draft. The external-browser entry point opens the website outside the embedded view.

## Temporary sidebar chat

Run `/侧栏（网页版）` in the DSH composer to open a separate temporary website conversation alongside the main chat.

Closing waits until its own website conversation is deleted. If login, connectivity or deletion fails, the panel remains open with an error. Restore connectivity and close again to retry. Cleanup only targets the conversation owned by that temporary panel. Ordinary web chats retain their history.

Temporary means the panel cleans up its website conversation when it closes. Messages are still processed by the DeepSeek website while in use; this does not promise private browsing, immediate zero server retention or automatic cleanup after a power failure. Close the panel and confirm cleanup before quitting, force-stopping or uninstalling.

## Continue website history in DSH

Open the intended ordinary website conversation, ensure its history has loaded, then click **Continue in DSH**. The plugin reads messages and accessible attachments, creates a new DSH conversation and opens the result.

- Imports retain user and assistant roles, readable text, names and attachments.
- Requests are limited to 48 MiB including attachment encoding. Text and decoded attachment content together are limited to 32 MiB.
- Unreadable attachments produce warnings. Add necessary missing files before continuing. Files already read must be saved to DSH attachment storage; missing storage or a failed write stops the import instead of retaining only filenames.
- Imported history does not replay website tools, send model requests or execute instructions contained in the text. The next new message uses the DSH conversation's model and tools.
- The original website conversation remains available. After a failed import or lost receipt, keep the workbench panel open and click **Continue in DSH** again to retry the same messages and attachments. The plugin does not re-read the page to replace an unconfirmed request. Later website messages can be imported after that request succeeds.
- DSH session storage must be available before the imported session is created. A successful receipt is returned after persistence completes. Closing the entire workbench panel or restarting the app loses the unconfirmed frontend request; check DSH history before importing again to avoid duplicates.

Import indexes live in `$DSH_HOME/deepseek-workbench/imports/` (default `~/.dsh/deepseek-workbench/imports/`). DSH stores imported conversations and attachments in its native storage.

## API Platform

Open **Settings → Account → DeepSeek API Platform**. A compatible host account interface can reuse current DSH platform authorization. Otherwise use the separate website login or external-browser entry point. Platform authorization does not sign you into website chat.

## Desktop and browser

Embedded chat, history extraction and downloads require the [companion desktop host bridge](desktop-host_EN.md). The panel explains missing capabilities on a standard host. Browser-based DSH faces website embedding and cross-origin restrictions; use its external-browser entry point. Installing the plugin cannot remove those restrictions.
