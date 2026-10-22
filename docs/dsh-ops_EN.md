# dsh-ops

[简体中文](dsh-ops.md) · [Plugin compatibility](plugin-compatibility_EN.md) · [Upstream project](https://github.com/T-Auto/dsh-ops)

**dsh-ops**, developed by [T-Auto](https://github.com/T-Auto), adds bounded file reading, search, editing, document reading and shell execution to DSH. Tools are discovered and loaded on demand; larger results can be retrieved through references. Native mode returns compact text with line numbers, while PTC uses typed SDK results.

These fixed compatibility releases pin upstream **0.4.1**. **gulagala001** maintains adaptation for DSH `0.2.1-rc.1` and `0.2.1-rc.2`.

## Supported environments

| Item | Requirement |
| --- | --- |
| DSH | Exact `0.2.1-rc.1` or `0.2.1-rc.2`, with its matching artifact |
| Native runtime | Windows x64 (`win32-x64`), Linux x64 (`linux-x64`), macOS Apple Silicon (`darwin-arm64`) |
| Node.js | `^22.19 \|\| >=24`, using the matching host runtime |
| Shell | Local Bash on Linux/macOS; the upstream fixed optional Bash payload on Windows. PowerShell remains host-managed. |

Intel Mac, Linux ARM64, Windows ARM64 and other targets have no installation entry. Support depends on the complete platform/architecture pair; the package's separate `os` and `cpu` lists are insufficient.

Document reading supports bounded CSV/TSV, DOCX body paragraphs and a limited PDF text layer. Binary DOC, OCR and general PDF rendering are outside its document-reading scope. Check the [upstream format documentation](https://github.com/T-Auto/dsh-ops/blob/v0.4.1/docs/原生内核.md) for complex files.

## Installation

Open **Settings → Oh My DSH → Third-party features → dsh-ops** and turn on the install/enable switch. The entry selects a fixed package for the complete host version and runtime target, then verifies its recorded SHA-256. Unknown hosts and unsupported platforms have no installation entry.

For manual installation, select the fixed package for your host and use the target profile's native plugin manager. Desktop profiles require the desktop application's bundled CLI; Web/TUI use their matching host CLI. [DSH installation and pairing](install_EN.md)

| Exact host | Fixed compatibility package | Checksums |
| --- | --- | --- |
| `0.2.1-rc.2` | [dsh-ops-0.2.1-rc.2.ops.0.1.0.tgz](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.0/dsh-ops-0.2.1-rc.2.ops.0.1.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.0/SHA256SUMS) |
| `0.2.1-rc.1` | [dsh-ops-0.2.1-rc.1.ops.0.1.0.tgz](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.0/dsh-ops-0.2.1-rc.1.ops.0.1.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.0/SHA256SUMS) |

## Usage and defaults

After installation, ask for file or shell tasks directly, such as “Find where this project reads configuration,” “Read this DOCX document's body,” or “Run the build and report errors.” Tools use the current session's working directory, permissions and sandbox policy. Operations requiring approval continue through host approval.

- **Native mode:** starts with `ops_read_files`, `ops_discover_tools` and available `ops_bash`. Other file and document tools are discovered on demand and activated in subsequent requests for their owning agent.
- **PTC:** business tools run through the SDK inside `run_code`, retaining upstream discovery, batching and result references. The host may also expose `job_output`, `job_list`, `job_kill` and `runtime_status` for output retrieval, task listing, cancellation and runtime status.
- **Native tools:** replacement of the official `read`/`glob`/`grep` tools is off by default, preserving host tool entries.
- **Optional interfaces:** `dsh-ops/panel` and `dsh-ops/tui` are off by default. Enable them separately in host plugin configuration when needed, with the relevant interface extensions available.

Saved explicit settings take precedence over fresh-install defaults. To select Bash on Linux/macOS, set `bashPath` in `dsh-ops/shell` to an absolute path to your local Bash. See the [upstream configuration reference](https://github.com/T-Auto/dsh-ops/blob/v0.4.1/docs/配置参考.md) for Windows Bash selection and repair.

## Updates, disabling and data

Turning off the third-party feature switch disables dsh-ops and retains plugin settings and data. Turn it on again to resume. Use the target profile's native plugin manager to uninstall.

Catalog updates install registered fixed compatibility releases matching the current host; they **do not follow upstream `latest`**. Upgrading through an external marketplace or CLI can bypass that pin. If you install another version, check the complete host, runtime target and plugin version again. A host upgrade also requires the corresponding artifact.

## Sources and licensing

Original authors: **T-Auto and the dsh-ops contributors**. Compatibility maintainer: **gulagala001**. Compatibility releases retain upstream **MIT AND Apache-2.0**, attribution, `NOTICE` and provenance records. The optional Windows Bash payload retains its own component licenses. [Full sources and licensing](../THIRD_PARTY_NOTICES.md#dsh-ops-compatibility-distribution)
