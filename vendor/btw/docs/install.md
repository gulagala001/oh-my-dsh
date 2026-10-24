# Install DSH BTW

宿主构建以 `package.json` 的完整版本为准，当前源码默认 `0.2.1-rc.3`。每份构建对齐同版本 SDK、组件与依赖锁，安装入口按正式发行包的宿主版本选择。

[中文](install.zh.md)

Requires **DSH 0.2.1-rc.3**, **Cordis 4.0.5** and **Node.js 22.19+**. This build targets that exact host version.

## Add Plugin

Open **Plugins → Add Plugin**, paste the URL below and install:

```text
https://github.com/gulagala001/dsh-btw/releases/download/v0.1.4-dsh.0.2.1-rc.3/gulagala001-dsh-btw-0.1.4-dsh.0.2.1-rc.3.tgz
```

Keep your existing profile, configuration and data. Restart the corresponding instance after active tasks finish.

## Command line

Replace `web` with the profile used by your DSH instance:

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-btw/releases/download/v0.1.4-dsh.0.2.1-rc.3/gulagala001-dsh-btw-0.1.4-dsh.0.2.1-rc.3.tgz
```

Package identity: `@gulagala001/dsh-btw`. Use the fixed archive URL; this release is distributed through GitHub Releases.

## Ask your AI assistant

```text
Install DSH BTW into my existing DSH profile using:
https://github.com/gulagala001/dsh-btw/releases/download/v0.1.4-dsh.0.2.1-rc.3/gulagala001-dsh-btw-0.1.4-dsh.0.2.1-rc.3.tgz
First verify DSH 0.2.1-rc.3, Cordis 4.0.5 and Node.js 22.19+.
Preserve my configuration and data. Restart only after active tasks finish.
```

Verify a downloaded archive against the release attachment [SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.4-dsh.0.2.1-rc.3/SHA256SUMS).

After sending a main message, enter `/btw your question`. Enter `/btw` to reopen the popover and its history. Side history is stored only in the current window and is cleared on reload.

Closing the popover only hides it. Stop cancels the current side request and preserves text already received. Only explicitly completed, untruncated replies enter follow-up context; failed or interrupted replies can be retried manually. Disabling the last side-chat entry cancels requests and clears history from window memory.
