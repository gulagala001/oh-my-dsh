# DSH Response ID Reuse

[中文](README.md) · [Changelog](CHANGELOG.md)

[![GitHub downloads](https://img.shields.io/github/downloads/gulagala001/dsh-response-id-reuse/total?label=GitHub%20release%20downloads)](https://github.com/gulagala001/dsh-response-id-reuse/releases)

Automatic ID continuation for Responses API providers. Reuse server-stored context to reduce repeated transmission of messages and images.

- Enabled when loaded; runs entirely in the backend.
- Uses ordinary response receipts, with no provider allowlist or probe messages.
- Keeps usable continuation histories for main requests, background work and concurrent branches.
- Rebuilds continuation through ordinary requests after temporary storage misses.
- Replaces an expired ID during the full-context fallback and matches reusable history prefixes exactly.
- Restores native behavior when disabled or uninstalled.

## Install

**DSH 0.2.1-rc.3** · Node 22.19+

Paste this URL into **Plugins → Add plugin**:

```text
https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.2-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.2-dsh.0.2.1-rc.3.tgz
```

[SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.2-dsh.0.2.1-rc.3/SHA256SUMS)

## Uninstall

Disable or uninstall through the DSH plugin manager.

[Contributing](CONTRIBUTING.md) · [Documentation](docs/documentation.md) · [MIT](LICENSE)
