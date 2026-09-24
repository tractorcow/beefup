# Staging

`beefup stage` generates a proposed upgrade. It does not install packages, does not run lifecycle scripts, and does not leave the live `package.json` or lockfile upgraded.

```sh
beefup stage
beefup stage --mode latest --strategy inplace
beefup stage --dir /path/to/project --format markdown
beefup stage --package-root ./app
```

## What it does

1. Detects npm or pnpm from the lockfile (`package-lock.json` or `pnpm-lock.yaml`). If both exist, it uses `packageManager` in `package.json`.
2. Fails if Safe Chain is not available (`aikido-npm` / `aikido-pnpm`, or `safe-chain` on `PATH`), unless `--no-safe-chain` is set.
3. Prepares an isolated workspace (`worktree` or `inplace`).
4. Rewrites direct dependency specs for the chosen mode, skipping `workspace:`, `file:`, `link:`, and `catalog:`.
5. Regenerates the lockfile only (`npm update --package-lock-only` or `pnpm update --lockfile-only`), with `--ignore-scripts`.
6. Re-pins those direct dependencies to the exact versions in the new lockfile.
7. Copies manifests and the lockfile to `.beefup/staged`.
8. Deletes `.beefup/prior` if it exists, so only a proposal snapshot remains.
9. Restores or discards the isolated workspace so the live tree matches the start state.
10. Writes a report via `beefup report` (live vs staged). See [report](report.md).

## Options

| Option | Values | Default |
| --- | --- | --- |
| `--mode` | `same-major`, `latest` | `same-major`, or `beefup.mode` in project config |
| `--strategy` | `worktree`, `inplace` | `worktree` |
| `--dir` | path | current working directory |
| `--package-root` | path | project root, or `packageRoot` in project config (repeatable) |
| `--format` | `html`, `markdown`, `text` | `html` (file under `.beefup/report`; `report.json` is always written) |
| `--no-safe-chain` | flag | off (require Safe Chain; with the flag, use npm/pnpm directly) |
| `--quiet`, `-q` | flag | off (suppress warnings) |
| `--verbose`, `-V` | flag | off (log major steps and timings to stderr) |
| `--debug` | flag | off (also log git and subprocess commands) |
| `--log-level` | `quiet`, `warn`, `info`, `debug` | `warn` |

`--mode` overrides project config. `same-major` rewrites pins to `^<current>`. `latest` rewrites them to `>=<current>`. After lockfile regeneration, specs are re-pinned to exact versions.

Run Beefup at the project (git) root. Use `--package-root ./app` (repeatable) or config `packageRoot` when `package.json` and the lockfile live in a subdirectory. `.beefup/` is written **inside each package root**. See [configuration](configuration.md).

## Strategies

Both strategies produce the same output: rewritten `package.json` file(s) and lockfile under `.beefup/staged`. They differ in where the package manager runs.

**`worktree` (default)** — `git worktree add --detach <package>/.beefup/work HEAD` from the **git root**. The live tree is never mutated. If `--package-root` is set, the package manager runs in that subdirectory of the worktree. Fails if the directory is not a git repository, or if `git status --porcelain` shows staged, unstaged, or untracked files **under that package root** outside any `.beefup/` directory (sibling packages and a previous stage's artefacts do not block re-stage). Leftover worktrees from a crashed run are removed first. Projects may gitignore `**/.beefup` so it stays out of everyday `git status`; Beefup does not edit `.gitignore`.

**`inplace`** — backups every file Beefup might write (workspace `package.json` files, lockfile, `pnpm-workspace.yaml`) to `.beefup/backup`, mutates the real workspace so globs such as `apps/*` still resolve, copies the proposal to `.beefup/staged`, then restores the originals. Use this when the working tree is dirty. If `.beefup/IN_PROGRESS` is left behind after a crash, the next run restores from backup before starting.

```sh
beefup stage --strategy inplace
```

## Output

After a successful stage, `<package>/.beefup/staged` contains only the proposed package files (so `app/package.json` is stored as `app/.beefup/staged/package.json`):

- Root and workspace `package.json` files
- `package-lock.json` or `pnpm-lock.yaml`
- `pnpm-workspace.yaml` when present

`--format` selects the human-readable file under `.beefup/report` (`REPORT.html` by default). `report.json` is always written. Stdout is automatic colour or plain text. See [report](report.md) for comparison context, file layout, and formats.

Tweak pins or overrides in the live project and run `beefup stage` again until the proposal is acceptable. When it is, run `beefup accept` to apply it.

## Project config

See [configuration](configuration.md) for the shared schema (`.beefup.json`, `package.json#beefup`, `pnpm-workspace.yaml#beefup`, and `packageRoot`).

## Failures and warnings

Stage **fails** when Safe Chain is missing (unless `--no-safe-chain`), lockfile regeneration fails, `latest` or `*` remain after re-pin, an override uses a banned `latest` tag, or package.json and pnpm workspace overrides disagree on a shared key. Alignment mismatches fail unless configured to warn.

Leftover loose ranges (for example `^1.2.3`) warn when `preferExact` is true. Override pins below a requested range also warn and do **not** fail stage. Introduced CVEs are printed loudly and listed in the report; they do **not** fail stage. Review `.beefup/staged` before `beefup accept`.
