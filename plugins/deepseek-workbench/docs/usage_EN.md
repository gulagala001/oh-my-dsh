# DeepSeek Workbench usage

[简体中文](usage.md) · [Back to README](../README_EN.md)

## Web chat

Click **DeepSeek web chat** in the left sidebar to open DeepSeek chat in the main view. The first time, sign in to `chat.deepseek.com`; this account is separate from the API platform account in DSH. Pick a chat from your history or start a new one to send messages, upload attachments and switch DeepThink and web search.

Normal chats stay in your DeepSeek history. If loading or an action fails, follow the hint in the panel and try again; a failed send keeps what you typed. To leave the embedded page, open it in an external browser.

## Temporary sidebar

Type `/侧栏（网页版）` in the DSH composer to open a separate temporary chat, handy for questions while you read the main chat.

When you click close, the panel deletes this DeepSeek conversation first and closes once that is done. If you are signed out, offline or deletion fails, the panel stays open with an error; close it again once the connection is back. Normal web chat history is not affected.

"Temporary" means the conversation is deleted when you close the panel. While you chat, DeepSeek still processes the messages, so it is not a private browsing mode. Before quitting DSH, force-closing it or uninstalling the plugin, close the temporary sidebar and make sure it finished cleaning up.

## Continue in DSH

Open the chat you want in web chat, wait for its history to load and click **Continue in DSH**. The plugin reads the messages and the attachments it can access, creates a new DSH conversation and opens it.

- Imported content keeps user and assistant roles and the text, file names and attachments it could read.
- Each import is limited to 48 MiB including encoded attachments, and 32 MiB of text plus decoded attachments.
- You are told about attachments it cannot read; add the files you need and continue. Files it did read go into DSH's attachment storage. If storage fails, the whole import reports an error instead of keeping only file names.
- Tool calls and written instructions in the web chat are never run again, and nothing is sent automatically. The next message uses the model and tools of the DSH conversation.
- The original web chat stays. If an import fails, keep the panel open and click **Continue in DSH** again to retry the same content. Messages added on the web later can be imported again after this one succeeds.
- If you closed the whole panel or restarted DSH during an import, check your DSH history for the conversation before trying again, to avoid a duplicate.

The import index is stored in `$DSH_HOME/deepseek-workbench/imports/` (default `~/.dsh/deepseek-workbench/imports/`). DSH stores the conversation and attachments itself.

## API platform

Open **Settings → Account → DeepSeek API Platform**. If your DSH supports it, the platform reuses your current DSH sign-in; otherwise sign in on the page or open it in an external browser. The platform account does not replace the web chat sign-in.

## Desktop and browser

Embedded chat needs the DSH desktop app. Sign-in that survives restarts and DeepSeek downloads need the [desktop adaptation](desktop-host_EN.md); the panel tells you when these are missing. In the browser version of DSH, DeepSeek's embedding restrictions mean web chat opens in an external browser only.
