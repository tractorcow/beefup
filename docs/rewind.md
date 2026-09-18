# Rewind

`beefup rewind <git-ref>` copies historic manifests from a git revision into `.beefup/prior` and regenerates the report in the **applied** context (prior vs live). It does not check out a worktree or change the live tree.

```sh
beefup rewind HEAD~1
beefup rewind v1.2.3
beefup rewind --dir /path/to/project abcdef0
beefup rewind --package-root ./app HEAD~1
```

## What it does

1. Requires a git repository. Fails on an invalid ref (`git rev-parse --verify`).
2. Detects the live lockfile name (npm vs pnpm).
3. Extracts `package.json` and that lockfile from the ref (`git show <ref>:<path>`), plus `pnpm-workspace.yaml` / `.npmrc` when they existed then. Paths are under `--package-root` when that option is set.
4. Uses historic workspace globs to find nested `package.json` paths and extracts any that existed at that revision.
5. Atomically replaces `.beefup/prior` with that snapshot.
6. Runs `beefup report` in applied context (forced, so a leftover differing staged tree does not steal the comparison).

Rewind only needs a read-only copy of historic manifests. It does not require a clean working tree.

`--dir`, `--package-root`, and `--format` apply. `--format` controls stdout; HTML and JSON are always written under `.beefup/report`.

## Failures

Rewind **fails** outside a git repository, when the ref does not exist, when the historic revision has no root `package.json` or matching lockfile, or when report generation fails (missing Safe Chain, policy errors on the live tree, and so on).
