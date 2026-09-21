# Rewind

`beefup rewind <git-ref>` copies historic manifests from a git revision into `.beefup/prior` and regenerates the report in the **applied** context (prior vs live). It does not check out a worktree or change the live tree.

```sh
beefup rewind HEAD~1
beefup rewind v1.2.3
beefup rewind --dir /path/to/project abcdef0
beefup rewind --package-root ./app HEAD~1
beefup rewind --debug --package-root ./app HEAD~1
```

## What it does

1. Requires a git repository. Fails on an invalid ref (`git rev-parse --verify`).
2. Detects the live lockfile name (npm vs pnpm).
3. Extracts `package.json` and that lockfile from the ref (`git show <ref>:<path>`), plus `pnpm-workspace.yaml` / `.npmrc` when they existed then. Paths are under `--package-root` when that option is set. Snapshots are written to that package's `.beefup/prior`.
4. Uses historic workspace globs to find nested `package.json` paths and extracts any that existed at that revision.
5. Atomically replaces `.beefup/prior` with that snapshot and removes `.beefup/staged` if it exists.
6. Runs `beefup report` in applied context (prior vs live).

Rewind only needs a read-only copy of historic manifests. It does not require a clean working tree.

`--dir`, `--package-root`, `--format`, `--no-safe-chain`, `--quiet`, `--verbose`, `--debug`, and `--log-level` apply. `--package-root` is repeatable; config `packageRoot` is used when omitted. `--format` selects the human-readable file under `<package>/.beefup/report`; `report.json` is always written. Stdout is automatic colour or plain text. See [report](report.md) and [configuration](configuration.md). `--verbose` / `--debug` print extract and scan progress on stderr (useful for large lockfiles).

## Failures

Rewind **fails** outside a git repository, when the ref does not exist, when the historic revision has no root `package.json` or matching lockfile, or when report generation fails (missing Safe Chain unless `--no-safe-chain`, policy errors on the live tree, and so on).
