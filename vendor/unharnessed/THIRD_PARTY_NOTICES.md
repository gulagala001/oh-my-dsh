# Third-party notices

## Unharnessed Python runtime

Source: https://github.com/unharnessed-agent/Unharnessed

Commit: `fe2cf2815f78463464b91c598fc0c31c0af98f4c` (2026-11-15).

The following files are copied without code changes from
`unharnessed-runtime/src/rlm/` at that commit:

- `vendor/rlm/__init__.py`
- `vendor/rlm/repl.py`
- `vendor/rlm/bash.py`
- `vendor/rlm/_winjob.py`
- `vendor/rlm/variables.py`
- `vendor/rlm/repl.md`

License: MIT, reproduced in full in `vendor/LICENSE.Unharnessed`.

Upstream copyright notices include Unharnessed, Prime Intellect Ltd. and
Mario Zechner. See the preserved license for the exact notices.

`python/entry.py`, `python/bootstrap.py`, the DSH plugin and its preset are
new integration code. No upstream Rust binary, model client, package installer,
VS Code extension or ACP agent is included.

## DeepSeek Harness

The plugin uses the host's public Cordis and DSH package interfaces.
No DSH host source, runtime distribution, user configuration or credentials
are included in this package. Compatibility was checked against the installed
DSH Desktop runtime `0.2.2-rc.3`.

## dill 0.4.0

- Upstream: https://github.com/uqfoundation/dill
- Distribution: https://pypi.org/project/dill/0.4.0/
- Source wheel: `dill-0.4.0-py3-none-any.whl`
- SHA-256: `44f54bf6412c2c8464c14e8243eb163690a9800dbe2c367330883b19c7561049`
- License: BSD-3-Clause; preserved in `vendor/LICENSE.dill`.
- Vendored Python package in `vendor/dill`; upstream test files are excluded.
- Used by the bounded checkpoint bridge in `python/state.py` and the existing upstream restore protocol. No runtime package installation occurs.

## OMD integration

OMD preserves the complete DSH Unharnessed distribution. Its wrapper uses a distinct preset and cancellation projection, an OMD-owned checkpoint directory, and a read-only activity callback for safe settings changes. The integration callback is optional; the standalone entry retains its original defaults. Source and adapted SHA-256 inventories are maintained in `../unharnessed.json`.
