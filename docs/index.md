# Beefup documentation

Beefup proposes npm and pnpm dependency upgrades without applying them. It rewrites version constraints, regenerates a lockfile without installing packages or running lifecycle scripts, then writes the result under `.beefup/staged` for review. The human-readable report is `.beefup/report/REPORT.html`; stdout defaults to colour.

The live project is left unchanged until you run `beefup accept`.

## Contents

- [Staging](stage.md) — `beefup stage` / `beefup report`, strategies, and project config
- [Accept](accept.md) — `beefup accept`, applying the staged upgrade and frozen install
- [Install and update](../README.md) — global install from a git checkout (not npmjs.com)

## Requirements

- Node.js 22+
- pnpm 11.22.0 or npm 12+
- [Aikido Safe Chain](https://github.com/AikidoSec/safe-chain) wrapping the package manager
- A `package-lock.json` or `pnpm-lock.yaml` in the target project
