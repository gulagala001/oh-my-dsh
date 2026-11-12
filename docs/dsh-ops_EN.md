# dsh-ops

[中文](dsh-ops.md) · [Docs](README_EN.md) · [Plugin compatibility](plugin-compatibility_EN.md) · [Upstream](https://github.com/T-Auto/dsh-ops)

**dsh-ops**, by [T-Auto](https://github.com/T-Auto), adds stronger tools to DSH for reading, searching and editing files, reading documents and running commands. Tools load when needed, and large results can be fetched later by reference. Normal mode returns compact text with line numbers; PTC mode returns typed SDK results.

This is a compatibility build of upstream **0.4.1**, with DSH adaptation maintained by **gulagala001**.

## Support

| Item | Requirement |
| --- | --- |
| DSH | 0.2.2-rc.2; each DSH version has its own package |
| Platform | Windows x64, Linux x64, macOS Apple Silicon |
| Shell | Local Bash on Linux / macOS; optional bundled Bash on Windows, with PowerShell managed by DSH |

There are no packages for Intel Macs, Linux ARM64 or Windows ARM64.

Document reading covers CSV / TSV, DOCX body paragraphs and the text layer of PDFs, but not legacy DOC, OCR or PDF rendering. For complex formats, see the [upstream format notes](https://github.com/T-Auto/dsh-ops/blob/v0.4.1/docs/原生内核.md).

## Install

Turn on **Settings → Oh My DSH → Third-party → dsh-ops**. OMD picks the package for your DSH version and platform and checks its SHA-256; unsupported versions or platforms show no install option.

To install by hand, give the matching package to the target profile's plugin manager: the desktop app's bundled command line, or the web version's matching command line. See the [installation guide](install_EN.md).

| DSH | Package | Checksums |
| --- | --- | --- |
| 0.2.2-rc.2 | [dsh-ops-0.2.2-rc.2.ops.0.1.0.tgz](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.2.omd.1.3.17/dsh-ops-0.2.2-rc.2.ops.0.1.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.2.omd.1.3.17/SHA256SUMS) |

<!-- history -->
Older DSH versions: [0.2.1-rc.5](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.5.omd.1.2.2) · [0.2.1-rc.3](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.3.omd.0.100.1) · [0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.99.0) · [0.2.1-rc.1](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.99.0)
<!-- /history -->

## Use

Once installed, just ask for file or command work, such as "find where this project reads its config", "read the body of this DOCX" or "run the build and report errors". Tools follow the session's working directory, permissions and sandbox, and approvals work as usual.

- **Normal mode**: starts with `ops_read_files`, `ops_discover_tools` and `ops_bash`; other tools load when needed.
- **PTC mode**: called through the SDK inside `run_code`. `job_output`, `job_list`, `job_kill` and `runtime_status` stay directly callable.
- **Native tools**: DSH's own `read` / `glob` / `grep` are not replaced by default.
- **Panels**: `dsh-ops/panel` and `dsh-ops/tui` are off by default; turn them on in the plugin settings if you want them.

Settings you already have take precedence over defaults. To choose a Bash on Linux / macOS, set an absolute `bashPath` in `dsh-ops/shell`. For Bash on Windows, see the [upstream configuration reference](https://github.com/T-Auto/dsh-ops/blob/v0.4.1/docs/配置参考.md).

## Updates, disabling and data

Turning the switch off on the third-party page disables dsh-ops and keeps its settings and data; turn it on again to resume. Remove it from the profile's plugin manager.

OMD only installs registered compatibility builds that match your DSH, **never upstream latest**. If you install another version from a market or the command line, check the DSH version, platform and plugin version yourself. After upgrading DSH, switch to the matching package.

## Source and license

Original authors: **T-Auto and dsh-ops contributors**. Compatibility work: **gulagala001**. The build keeps the upstream **MIT AND Apache-2.0** license, attribution, `NOTICE` and source records; the optional Windows Bash keeps its own component licenses. See [third-party notices](../THIRD_PARTY_NOTICES.md#dsh-ops-compatibility-distribution).
