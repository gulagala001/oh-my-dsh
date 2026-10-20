# Third-party notices

DSH Workflow is licensed under [MIT](LICENSE). Project contributions in this distribution are Copyright (c) 2026 gulagala001.

## DeepSeek Harness

- Upstream: https://github.com/deepseek-ai/deepseek-harness
- Version: `0.2.1-rc.2`
- Source tag: `dsh-v0.2.1-rc.2`
- Pinned commit: `687f282e8625c6b8d11ff58211a90524be2e4317`
- License: MIT, Copyright (c) 2026 DeepSeek
- Preserved license: [vendor/dsh/LICENSE](vendor/dsh/LICENSE)
- Source manifest and file checksums: [vendor/dsh.json](vendor/dsh.json)

The `vendor/dsh/` tree contains the pinned Workflow, Workflow PTC and tool-workflow foundation, related helpers and package reference documents. The distributed host and guest bundles derive from these sources together with the workflow enhancements maintained in this project. The upstream license and copyright notice are retained. Bundled upstream reference documents describe their original packages; current plugin behavior is documented in this repository's README and usage guide.

## Acorn

The bundled workflow JavaScript parser uses [Acorn](https://github.com/acornjs/acorn), licensed under MIT, Copyright (C) 2012-2022 by various contributors. Its complete license notice is retained in [docs/licenses/acorn.txt](docs/licenses/acorn.txt).

## Host-provided dependencies

DSH, Cordis, Schemastery, React and related host services are resolved through the installed host where applicable; their identities and licenses remain those of their respective packages. Development dependencies listed in `package.json` retain their own licenses.
