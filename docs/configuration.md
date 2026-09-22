# Configuration

Beefup uses one config schema everywhere. The same object can live in:

- `.beefup.json` at `--dir`, or the git root when `--dir` has no `.beefup.json` (so a repo with no root `package.json` can still configure Beefup)
- `package.json` under the `beefup` key
- `pnpm-workspace.yaml` under the `beefup` key

Later sources win on conflict:

1. Built-in defaults
2. Repo `.beefup.json`
3. Repo `package.json#beefup`
4. Repo `pnpm-workspace.yaml#beefup`
5. The package being upgraded: `package.json#beefup`
6. That package’s `pnpm-workspace.yaml#beefup`
7. CLI `--mode`

When the package root is `.`, the repo and package files are the same path and are not applied twice.

## Schema

```json
{
  "mode": "same-major",
  "bannedRanges": ["latest", "*"],
  "preferExact": true,
  "alignment": "error",
  "alignedGroups": [
    {
      "name": "strapi",
      "source": "@strapi/strapi",
      "packages": ["@strapi/admin", "@strapi/core"]
    }
  ],
  "packageRoot": ["apps/*", "packages/api"]
}
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `mode` | `same-major`, `latest` | `same-major` | Constraint rewrite before lockfile regeneration. CLI `--mode` overrides this. |
| `bannedRanges` | string[] | `["latest", "*"]` | Dependency specs that fail policy after re-pin. |
| `preferExact` | boolean | `true` | Warn when a leftover range such as `^1.2.3` remains. |
| `alignment` | `error`, `warn` | `error` | Default for aligned-group mismatches. |
| `alignedGroups` | object[] | `[]` | Groups of packages that must share a version; `onMismatch` may override `alignment` per group. |
| `packageRoot` | string or string[] | `.` | Package directories (literal paths or globs) relative to the config file. Each must contain `package.json` and a lockfile. |

`.beefup.json` is the whole object. In `package.json` / `pnpm-workspace.yaml` the object is nested under `beefup`.

## Package roots

A **package root** is a directory with `package.json` and `package-lock.json` or `pnpm-lock.yaml`. Beefup does not require an npm/pnpm workspace or a root lockfile.

Each package root is its own Beefup project: `.beefup/staged`, `.beefup/prior`, `.beefup/report`, and the worktree/backup live **inside that directory**. Gitignore `**/.beefup` (Beefup does not edit `.gitignore`). This is a breaking change from older releases, which always wrote `.beefup/` at `--dir`.

Which roots a command runs:

1. Repeatable CLI `--package-root` (paths or globs relative to `--dir`)
2. Else the merged repo-level `packageRoot`
3. Else `.` (the project directory)

If `packageRoot` is a list, every command (`stage`, `report`, `accept`, `revert`, `rewind`) runs for each root in one process, sequentially. Each root keeps its own snapshot and report. A failure in one root does not skip the rest; the process exits `1` if any root failed.

If you `cd` into a **nested** configured package (or pass `--dir` there), Beefup runs **only that** root. Running from the git root always uses the full `packageRoot` list, even when the list includes `"."`.

A nested package’s own `packageRoot` field is valid schema but does not re-pick roots after that package is already selected.

```sh
beefup stage --package-root ./apps/web
beefup stage --package-root ./apps/web --package-root ./apps/api
```

```json
{
  "beefup": {
    "packageRoot": ["apps/*"]
  }
}
```

Globs that match nothing, or a literal path missing `package.json` / a lockfile, fail. Glob matches without a lockfile are skipped.

## Repo with many lockfiles and no workspace

Put `.beefup.json` (or `beefup` in a root `package.json` that has no lockfile) at the git root:

```json
{
  "mode": "same-major",
  "packageRoot": ["apps/*", "services/*"]
}
```

Then `beefup stage` at the git root upgrades every matching package. `cd apps/web && beefup accept` applies only `apps/web`.
