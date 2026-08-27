# Accept

`beefup accept` applies a reviewed `.beefup/staged` proposal to the live project and installs from that lockfile. This is the only Beefup command that downloads packages or runs lifecycle scripts.

```sh
beefup accept
beefup accept --dir /path/to/project
```

## What it does

1. Detects npm or pnpm from the lockfile. Fails if `.beefup/staged` has no matching lockfile (`run beefup stage first`).
2. Fails if `.beefup/IN_PROGRESS` exists (an in-place stage was interrupted). Re-run `beefup stage` to restore the live tree.
3. Fails if Safe Chain is not available (`aikido-npm` / `aikido-pnpm`, or `safe-chain` on `PATH`).
4. Re-checks range, override, and alignment policy on the staged files. Error-severity findings refuse the accept; warnings print to stderr.
5. Copies staged `package.json` files, the lockfile, and `pnpm-workspace.yaml` / `.npmrc` when present into the live project.
6. Installs with `npm ci` or `pnpm install --frozen-lockfile` through Safe Chain (never bare `npm install`).

`.beefup/staged` and `.beefup/report` are left in place as an audit trail. Accept is idempotent: running it again recopies the same files and reinstalls.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `--dir` | path | current working directory |

`--mode`, `--strategy`, and `--format` are stage/report options and are ignored.

## Failures

Accept **fails** when there is no staged lockfile, an in-place stage is in progress, Safe Chain is missing, staged policy has errors (banned `latest`/`*`, stale override pins, alignment mismatches), or the frozen install exits non-zero.

If the install fails after files were copied, the live manifests and lockfile stay at the accepted versions. Fix the installer error and run `beefup accept` again.

Introduced CVEs do **not** fail accept. Review the report from `beefup stage` / `beefup report` before running this command.
