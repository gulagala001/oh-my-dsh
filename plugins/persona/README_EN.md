# Persona

[简体中文](README.md)

**dsh-persona-plugin** brings editable, shareable personality presets to DeepSeek Harness, keeping identity, voice, communication and answer presentation consistent.

![Persona settings](docs/images/persona.png)

## Features

- Four modules: identity, language style, communication and answer presentation, with default inheritance.
- Built-in Default, Overclock (超频) and Economical (精算) personalities; create, copy, rename, update and delete your own presets.
- Copy a creation prompt to an AI, then import its generated JSON file. Export personalities for backup or sharing; duplicate imports receive a new name.
- A global default and independent conversation choices, enabled by default and available in the permissions drawer and applied to subsequent requests.
- Detailed controls live under a collapsed Advanced section; failed saves retain editor drafts.

## Installation

In **Plugins → Add plugin**, paste the fixed package URL:

```text
https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.2-dsh.0.2.1-rc.3/gulagala001-dsh-persona-plugin-0.1.2-dsh.0.2.1-rc.3.tgz
```

[SHA256SUMS](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.2-dsh.0.2.1-rc.3/SHA256SUMS)

This build targets exactly **DSH 0.2.1-rc.3**, **Cordis 4.0.5** and **Node.js 22.19+**.

Install `gulagala001-dsh-persona-plugin-0.1.2-dsh.0.2.1-rc.3.tgz` using its absolute local path in **Plugins → Add plugin**, or run:

```sh
dsh plugin --profile desktop add /absolute/path/gulagala001-dsh-persona-plugin-0.1.2-dsh.0.2.1-rc.3.tgz
```

Replace `desktop` with your instance's actual profile and restart that instance after its current work finishes.

## Usage

**Overclock** invests in useful explanations for quality, depth and completeness. **Economical** reduces unnecessary text and repetition while preserving deliverable quality. On upgrade, retired built-in global selections fall back to Default, and conversation selections fall back to the global choice. Custom content and explicitly disabled session personalities are preserved.

Open **Settings → Persona** to choose a global personality. Expand **Advanced**, then create a personality or copy an existing preset and edit its modules. The editor selection is independent of the global selection.

Use **Copy creation prompt** and give it to an AI with your character idea. Import the resulting JSON file to create and select a new preset. **Export personality file** saves the current editor content for sharing or further editing.

**Session personalities** are enabled by default. Choose the global default, a specific personality or Off in a main conversation's permissions drawer. Disabling the feature uses the global personality while retaining saved conversation choices. Deleting a referenced preset falls back to the global selection with a notice.

Personality controls identity and expression preferences. The host still manages the actual environment, permissions, tool protocols, task controls and memory processing. Data is stored per profile. Legacy personality files can be imported directly.

## Build from source

```sh
npm install
npm run build
npm test
npm pack
```

Packaging checks public files, Git history and the actual installation archive. See the [file format](docs/personality-format.md).

## License

[MIT](LICENSE). Host component attribution is included in [third-party notices](THIRD_PARTY_NOTICES.md).

[Documentation structure and contributing](docs/documentation.md)
