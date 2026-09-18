# Beefup documentation

Beefup proposes npm and pnpm dependency upgrades without applying them. It rewrites version constraints, regenerates a lockfile without installing packages or running lifecycle scripts, then writes the result under `.beefup/staged` for review. The human-readable report is `.beefup/report/REPORT.html`; stdout defaults to colour.

The live project is left unchanged until you run `beefup accept`. After accept, `.beefup/prior` holds the previous live manifests so you can `revert` or compare the applied upgrade. `.beefup/staged` and `.beefup/prior` are mutually exclusive: `stage` deletes prior, `accept` / `rewind` / `revert` delete staged.

Run Beefup from the project root (the git root, or `--dir`). Use `--package-root ./app` when `package.json` and the lockfile live in a subdirectory; `.beefup/` still sits at the project root.

`beefup report` follows whichever snapshot exists: live vs staged after `stage`, or `.beefup/prior` vs live after accept, rewind, or revert.

## Contents

- [Staging](stage.md) — `beefup stage` / `beefup report`, strategies, and project config
- [Accept](accept.md) — `beefup accept`, applying the staged upgrade and frozen install
- [Revert](revert.md) — `beefup revert`, restoring `.beefup/prior`
- [Rewind](rewind.md) — `beefup rewind <git-ref>`, historic baseline into `.beefup/prior`
- [Install and update](../README.md) — global install from npm (`@tractorcow/beefup`) or a git checkout

## Requirements

- Node.js 22+
- pnpm 11.22.0 or npm 12+
- [Aikido Safe Chain](https://github.com/AikidoSec/safe-chain) wrapping the package manager
- A `package-lock.json` or `pnpm-lock.yaml` in the target project
