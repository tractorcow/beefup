# Revert

`beefup revert` undoes a previous `accept` by copying `.beefup/prior` back onto the live project and installing from that lockfile.

```sh
beefup revert
beefup revert --dir /path/to/project
beefup revert --package-root ./app
```

## What it does

1. Detects npm or pnpm from the lockfile. Fails if `.beefup/prior` has no matching lockfile (`run beefup accept` or `beefup rewind` first).
2. Fails if `.beefup/IN_PROGRESS` exists. Re-run `beefup stage` to restore the live tree.
3. Fails if Safe Chain is not available.
4. Copies prior `package.json` files, the lockfile, and `pnpm-workspace.yaml` / `.npmrc` when present onto the live project.
5. Removes `.beefup/staged` if it exists, so only `.beefup/prior` remains.
6. Installs with `npm ci` or `pnpm install --frozen-lockfile` through Safe Chain.
7. Regenerates `.beefup/report` in the **applied** context (prior vs live).

There is no policy gate: prior was previously live. Scripts may run, same as accept.

`.beefup/prior` stays in place as the restored baseline. Run `beefup stage` to propose a new upgrade (that deletes prior).

## Options

| Option | Values | Default |
| --- | --- | --- |
| `--dir` | path | current working directory |
| `--package-root` | path | project root, or the value stored in the last report |

`--mode`, `--strategy`, and `--format` are ignored.

## Failures

Revert **fails** when there is no prior lockfile, an in-place stage is in progress, Safe Chain is missing, or the frozen install exits non-zero.

If the install fails after files were copied, the live manifests stay at the prior versions. Fix the installer error and run `beefup revert` again.
