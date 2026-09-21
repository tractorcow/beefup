# Beefup documentation

Beefup proposes npm and pnpm dependency upgrades without applying them. It rewrites version constraints, regenerates a lockfile without installing packages or running lifecycle scripts, then writes the result under `.beefup/staged` for review. The human-readable report defaults to `.beefup/report/REPORT.html`; stdout is colour on a TTY.

The live project is left unchanged until you run `beefup accept`. After accept, `.beefup/prior` holds the previous live manifests so you can `revert` or compare the applied upgrade. `.beefup/staged` and `.beefup/prior` are mutually exclusive: `stage` deletes prior, `accept` / `rewind` / `revert` delete staged.

Run Beefup from the project root (the git root, or `--dir`). Use `--package-root ./app` (repeatable) or config `packageRoot` when several directories each have their own lockfile. `.beefup/` is co-located in each package root (`app/.beefup`), not at the git root. See [configuration](configuration.md).

`beefup report` follows whichever snapshot exists: live vs staged after `stage`, or `.beefup/prior` vs live after accept, rewind, or revert.

## Logging

Progress logs go to **stderr** so the report on stdout stays clean. Default is warnings and errors only.

| Option | Level | What it prints |
| --- | --- | --- |
| *(default)* | `warn` | `warning:` and `error:` |
| `--quiet`, `-q` | `quiet` | `error:` only |
| `--verbose`, `-V` | `info` | major steps with timings, plus package-manager and scanner commands |
| `--debug` | `debug` | verbose plus git/subprocess argv, cwd, byte sizes, and exit codes |
| `--log-level <level>` | `quiet`, `warn`, `info`, or `debug` | same as the shortcuts; last flag wins |

Use `--verbose` or `--debug` when a command looks stuck (lockfile regeneration, frozen install, audit, `git show` of a large lockfile).

## Contents

- [Configuration](configuration.md) — `.beefup.json`, `package.json#beefup`, and `packageRoot`
- [Staging](stage.md) — `beefup stage`, strategies, and project config
- [Report](report.md) — `beefup report`, proposal vs applied comparison, formats
- [Accept](accept.md) — `beefup accept`, applying the staged upgrade and frozen install
- [Revert](revert.md) — `beefup revert`, restoring `.beefup/prior`
- [Rewind](rewind.md) — `beefup rewind <git-ref>`, historic baseline into `.beefup/prior`
- [Install and update](../README.md) — global install from npm (`@tractorcow/beefup`) or a git checkout

## Requirements

- Node.js 22+
- pnpm 11.22.0 or npm 12+
- [Aikido Safe Chain](https://github.com/AikidoSec/safe-chain) wrapping the package manager (or `--no-safe-chain` to bypass)
- A `package-lock.json` or `pnpm-lock.yaml` in the target project
