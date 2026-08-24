# Staging

`beefup stage` generates a proposed upgrade. It does not install packages, does not run lifecycle scripts, and does not leave the live `package.json` or lockfile upgraded.

```sh
beefup stage
beefup stage --mode latest --strategy inplace
beefup stage --dir /path/to/project --format markdown
beefup report
beefup report --format json
```

## What it does

1. Detects npm or pnpm from the lockfile (`package-lock.json` or `pnpm-lock.yaml`). If both exist, it uses `packageManager` in `package.json`.
2. Fails if Safe Chain is not available (`aikido-npm` / `aikido-pnpm`, or `safe-chain` on `PATH`).
3. Prepares an isolated workspace (`worktree` or `inplace`).
4. Rewrites direct dependency specs for the chosen mode, skipping `workspace:`, `file:`, `link:`, and `catalog:`.
5. Regenerates the lockfile only (`npm update --package-lock-only` or `pnpm update --lockfile-only`), with `--ignore-scripts`.
6. Re-pins those direct dependencies to the exact versions in the new lockfile.
7. Copies manifests and the lockfile to `.beefup/staged`.
8. Restores or discards the isolated workspace so the live tree matches the start state.
9. Writes a report via `beefup report` (package diff with all scoped installs, policy, CVE introduced / unresolved / fixed).

Package diffs compare **path-for-path** (including nested installs and multiple versions of the same package). Displayed from/to columns list unique version tags only.

To regenerate that report later without re-running the upgrade proposal:

```sh
beefup report
beefup report --format markdown
```

## Options

| Option | Values | Default |
| --- | --- | --- |
| `--mode` | `same-major`, `latest` | `same-major`, or `beefup.mode` in project config |
| `--strategy` | `worktree`, `inplace` | `worktree` |
| `--dir` | path | current working directory |
| `--format` | `text`, `markdown`, `json` | `text` (stdout; files are always written) |

`--mode` overrides project config. `same-major` rewrites pins to `^<current>`. `latest` rewrites them to `>=<current>`. After lockfile regeneration, specs are re-pinned to exact versions.

## Strategies

Both strategies produce the same output: rewritten `package.json` file(s) and lockfile under `.beefup/staged`. They differ in where the package manager runs.

**`worktree` (default)** — `git worktree add --detach .beefup/work HEAD`. The live tree is never mutated. Fails if the directory is not a git repository, or if `git status --porcelain` shows staged, unstaged, or untracked files **outside** `.beefup/` (a previous stage's artefacts do not block re-stage). Leftover worktrees from a crashed run are removed first. Projects may gitignore `.beefup` so it stays out of everyday `git status`; Beefup does not edit `.gitignore`.

**`inplace`** — backups every file Beefup might write (workspace `package.json` files, lockfile, `pnpm-workspace.yaml`) to `.beefup/backup`, mutates the real workspace so globs such as `apps/*` still resolve, copies the proposal to `.beefup/staged`, then restores the originals. Use this when the working tree is dirty. If `.beefup/IN_PROGRESS` is left behind after a crash, the next run restores from backup before starting.

```sh
beefup stage --strategy inplace
```

## Output

After a successful stage, `.beefup/staged` contains only the proposed project files:

- Root and workspace `package.json` files
- `package-lock.json` or `pnpm-lock.yaml`
- `pnpm-workspace.yaml` when present

Reports are written separately under `.beefup/report`:

- `REPORT.md` — Summary (counts, beefup version, timestamp) → Security (Introduced → Unresolved → Fixed, with short section intros) → Policy → collapsible package diffs (`<details>`) → Legend / paths
- `report.json`

Package diffs split optional/platform packages into their own section, bold direct names and italicize transitive ones, use a single Version column for added/removed, and omit path-only churn (same unique versions, different install paths). Meta-vulns from npm audit are kept and labeled `transitive (via …)` instead of blank references. **Unresolved** findings are still open after the upgrade (formerly called retained).

Stdout prints the report in `--format` (`text` by default). Diff the live project against `.beefup/staged` to review the proposal. Tweak pins or overrides in the live project and run `beefup stage` again until the proposal is acceptable. Use `beefup report` to refresh `.beefup/report` (and stdout) after changing scanners or policy without re-staging. When the proposal is acceptable, run `beefup accept` to apply it.

## Project config

Optional `beefup` key in `package.json`. If `pnpm-workspace.yaml` also has `beefup`, the workspace file wins on conflict.

```json
{
  "beefup": {
    "mode": "same-major",
    "bannedRanges": ["latest", "*"],
    "preferExact": true,
    "alignedGroups": [
      {
        "name": "strapi",
        "source": "@strapi/strapi",
        "packages": ["@strapi/admin", "@strapi/core"]
      }
    ]
  }
}
```

Defaults: mode `same-major`, ban `latest` and `*`, prefer exact pins, alignment mismatches are errors (`alignment` may be `warn`).

## Failures and warnings

Stage **fails** when Safe Chain is missing, lockfile regeneration fails, `latest` or `*` remain after re-pin, or an override pin sits below a version the lockfile requires. Alignment mismatches fail unless configured to warn.

Leftover loose ranges (for example `^1.2.3`) warn when `preferExact` is true. Introduced CVEs are printed loudly and listed in the report; they do **not** fail stage. Review `.beefup/staged` before `beefup accept`.
