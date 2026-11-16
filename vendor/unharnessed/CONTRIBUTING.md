# Contributing

The plugin uses the public DSH APIs. `index.js` registers the preset tool, `lib/` implements bridges and checkpoints, and `python/` boots the fixed runtime in `vendor/`. Keep the upstream licenses and provenance intact.

Run against an existing unpacked DSH runtime with its `node_modules` directory:

```sh
DSH_TEST_RUNTIME=/path/to/dsh-runtime npm test
npm run docs:check
npm run public:check
npm pack
```

Tests use disposable profiles and synthetic model responses. `DSH_PRIMARY_RUNTIME` can point to the Desktop primary runtime. No model credentials are needed. Set `TMPDIR` to choose the temporary directory.

The publication gate checks Git files, history, tags and the actual npm archive. Keep private configuration, sessions, logs, working plans and generated test output out of Git and packages. CI and prepack run this gate. Update both READMEs and the bilingual CHANGELOG for user-visible changes. `docs/structure.json` records the published package version and documentation inventory.
