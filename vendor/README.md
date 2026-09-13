# OpenCU distribution

`opencu/` contains the unmodified release distribution from [gulagala001/opencu](https://github.com/gulagala001/opencu). The exact version and source commit are recorded in [opencu.json](opencu.json). Source is maintained only in that repository. Do not edit this generated copy.

The distribution is included directly because DSH/pnpm blocks GitHub subdependencies and requires installation-time preparation for git packages with local package dependencies. Oh My DSH uses Node package imports to load this copy and declares its runtime dependencies directly; users retain one-command installation without changing package-manager policy.

`opencu.json` records the source, archive checksum and SHA-256 of every distributed file. Updates replace the whole distribution from an OpenCU release archive and regenerate that manifest. The original package metadata and third-party notices remain included.
