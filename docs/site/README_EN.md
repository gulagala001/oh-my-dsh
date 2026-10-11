# Product Page and Documentation Site

[简体中文](README.md) · [Documentation index](../README_EN.md)

The site starts at the [English product page](../index_EN.html) or [Chinese product page](../index.html). Product pages use plain HTML, CSS, and JavaScript without external scripts or fonts. Markdown remains the authored source for documentation and can be read directly on GitHub. Build HTML before hosting it on a regular static server.

## Build and Host

From the repository root, prepare development dependencies and Chromium:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm docs:build
```

Linux CI uses `pnpm exec playwright install --with-deps chromium`. Documentation CI builds and checks the output before deploying `dist/site` to [GitHub Pages](https://gulagala001.github.io/oh-my-dsh/). Pull requests build and check the site without deploying it.

Host **`dist/site`** as the static root. Its root entry opens `docs/index.html`; the language switch opens `docs/index_EN.html`. Public Markdown becomes matching HTML while preserving the directory structure, relative links, fragments, and images. The output can be hosted at a domain root or subpath without a Markdown server.

Do not host the whole repository. Hosting only the source `docs` directory leaves Markdown unrendered.

## Publication Boundary

`scripts/build-docs.mjs` uses `marked` and `htmlparser2` with an explicit list of public guides, release notes, and assets. It checks internal links and sections. Private document references, symlinks, missing targets, and duplicate IDs stop the build. Raw research, internal implementation plans, handoffs, account configuration, and work records are excluded.

Source and vendor references link to GitHub without publishing those trees in the static output. The presence of release notes does not mean an unpublished candidate has a public release package.

The English pages have English navigation, table-of-contents labels, copy feedback, and accessibility labels. Language links open a corresponding translation when available, otherwise the other language's documentation index. Untranslated specialist guides in English navigation are marked **Chinese**. Historical release notes retain their original language.

## Diagrams and Screenshots

Mermaid diagrams render during the build through the pinned official `@mermaid-js/tiny` package and a local headless Chromium. The site receives static SVG, expandable source, and a full-size link. No Mermaid browser runtime or CDN is shipped. Diagrams remain readable without JavaScript.

Diagrams use static labels and descriptions; scripts, interactive links, and remote resources are rejected. Tiny excludes Mindmap, Architecture, KaTeX, and ELK; an ELK request falls back to Dagre as described by the [official documentation](https://mermaid.js.org/config/usage.html#elk-and-the-tiny-build). Missing Chromium, invalid syntax, unsupported diagrams, and a render taking more than 30 seconds stop the build while retaining the previous output.

`site.css` and `site.js` provide the product layout, screenshot tabs, light and dark theme previews, install tabs, copying, image recovery, and full-size previews. `docs.css` and `docs.js` provide document navigation, section navigation, code copying, and image recovery. Long tables and code scroll independently. Native navigation and document content remain readable without JavaScript.

`media/manifest.json` records screenshot hashes and the relationship between originals and cropped details. Screenshots show the same Launchpad sample task across requirements, browser actions, recall, and file checks. See [screenshots and sources](../showcase_EN.md) for the demonstration limits. The static site does not execute model calls, authentication, or installation.

## Release Links

Install links use the two public `0.10.0` tags for DSH alpha.1 and rc.2, with their exact `trisoul_x-<complete-version>.tgz` assets. Do not choose packages through GitHub latest. The source candidate and newer local OpenCU implementation are labeled separately; GitHub main and old packages must not be presented as containing those local changes.

Update host pairings, tags, assets, and text in both languages together. Documentation, static-site, and product-preview checks live in `test/documentation.test.mjs`, `test/docs-site.test.mjs`, and `test/site-preview-ui.test.mjs`. Report validation from the actual run.
