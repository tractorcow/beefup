# Accept

`beefup accept` applies a reviewed `.beefup/staged` proposal to the live project and installs from that lockfile. This is one of the Beefup commands that downloads packages or runs lifecycle scripts (`revert` does too).

```sh
beefup accept
beefup accept --dir /path/to/project
beefup accept --package-root ./app
```

## What it does

1. Detects npm or pnpm from the lockfile. Fails if `<package>/.beefup/staged` has no matching lockfile (`run beefup stage first`).
2. Fails if `<package>/.beefup/IN_PROGRESS` exists (an in-place stage was interrupted). Re-run `beefup stage` to restore the live tree.
3. Fails if Safe Chain is not available (`aikido-npm` / `aikido-pnpm`, or `safe-chain` on `PATH`), unless `--no-safe-chain` is set.
4. Re-checks range, override, and alignment policy on the staged files. Error-severity findings refuse the accept; warnings print to stderr.
5. Copies live writable files into `.beefup/prior` (the baseline for `revert` and applied reports).
6. Copies staged `package.json` files, the lockfile, and `pnpm-workspace.yaml` / `.npmrc` when present into the live project.
7. Removes `.beefup/staged`. After accept, only `.beefup/prior` remains as a snapshot.
8. Installs with `npm ci` or `pnpm install --frozen-lockfile` through Safe Chain (never bare `npm install`).
9. Regenerates `.beefup/report` in the **applied** context (`.beefup/prior` vs live).

## Options

| Option | Values | Default |
| --- | --- | --- |
| `--dir` | path | current working directory |
| `--package-root` | path | project root, or `packageRoot` in project config (repeatable) |
| `--format` | `html`, `markdown`, `text` | `html` (file under `.beefup/report`) |
| `--no-safe-chain` | flag | off (require Safe Chain; with the flag, use npm/pnpm directly) |
| `--quiet`, `-q` | flag | off (suppress warnings) |
| `--verbose`, `-V` | flag | off (log major steps and timings to stderr) |
| `--debug` | flag | off (also log git and subprocess commands) |
| `--log-level` | `quiet`, `warn`, `info`, `debug` | `warn` |

`--mode` and `--strategy` are ignored. `--package-root` selects one or more package roots (or is taken from config). `--format` applies to the report written after accept. See [configuration](configuration.md).

## Failures

Accept **fails** when there is no staged lockfile, an in-place stage is in progress, Safe Chain is missing (unless `--no-safe-chain`), staged policy has errors (banned `latest`/`*`, banned `latest` overrides, override-value drift, alignment mismatches), or the frozen install exits non-zero.

Override pins below a requested range warn and do **not** fail accept.

If the install fails after files were copied, the live manifests and lockfile stay at the accepted versions and `.beefup/staged` is already gone. Fix the installer error, or run `beefup revert` to restore `.beefup/prior`. A second `beefup accept` will not work until you `stage` again.

Introduced CVEs do **not** fail accept. Review the report from `beefup stage` / `beefup report` before running this command. See [report](report.md).

To undo an accept, run `beefup revert`. See [revert](revert.md) and [rewind](rewind.md).
