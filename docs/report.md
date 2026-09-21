# Report

`beefup report` regenerates the upgrade report from the current snapshot and live tree. It does not rewrite manifests, regenerate a lockfile, or install packages.

```sh
beefup report
beefup report --format markdown
beefup report --dir /path/to/project
beefup report --package-root ./app
```

`stage`, `accept`, `revert`, and `rewind` already write a report when they finish. Use this command to refresh `<package>/.beefup/report` (and stdout) after changing scanners or policy, without proposing or applying another upgrade.

## Comparison context

Only one of `.beefup/staged` and `.beefup/prior` exists after a successful command (in that package root). Report follows that snapshot:

| Snapshot | Context | Compared trees |
| --- | --- | --- |
| `.beefup/staged` | **proposal** | live (old) vs staged (new) |
| `.beefup/prior` | **applied** | prior (old) vs live (new) |

Proposal reports appear after `stage`. Applied reports appear after `accept`, `rewind`, or `revert`. If both folders somehow exist (for example a crash mid-accept), staged wins and the report is a proposal.

## What it does

1. Detects npm or pnpm from the live lockfile.
2. Chooses comparison trees as above. Fails if neither snapshot lockfile exists (`run beefup stage or beefup rewind first`).
3. Fails if Safe Chain is not available (`aikido-npm` / `aikido-pnpm`, or `safe-chain` on `PATH`), unless `--no-safe-chain` is set.
4. Diffs the two lockfiles path-for-path (including nested installs and multiple versions of the same package). Displayed from/to columns list unique version tags only.
5. Evaluates range, override, and alignment policy on the **after** tree (staged for a proposal, live for an applied report).
6. Scans both trees with `npm audit` / `pnpm audit` and Beefup’s pinned `cve-lite-cli`, then classifies findings as introduced, unresolved, or fixed.
7. Writes `.beefup/report/report.json` and one human-readable file for `--format`.
8. Prints a colour or plain-text report to stdout. Error-severity policy findings then fail the command; introduced findings warn on stderr but do not fail.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `--dir` | path | current working directory |
| `--package-root` | path | project root, or `packageRoot` in project config (repeatable) |
| `--format` | `html`, `markdown`, `text` | `html` (file under `.beefup/report`; `report.json` is always written) |
| `--mode` | `same-major`, `latest` | last report, else `same-major` / project config |
| `--strategy` | `worktree`, `inplace` | last report, else `worktree` |
| `--no-safe-chain` | flag | off (require Safe Chain; with the flag, use npm/pnpm directly) |
| `--quiet`, `-q` | flag | off (suppress warnings) |
| `--verbose`, `-V` | flag | off (log major steps and timings to stderr) |
| `--debug` | flag | off (also log git and subprocess commands) |
| `--log-level` | `quiet`, `warn`, `info`, `debug` | `warn` |

`--format` selects only the human-readable file. It does not change stdout. `--mode` and `--strategy` are recorded on the report for later runs. They do not re-run the upgrade. `--package-root` is used when set; otherwise Beefup uses config `packageRoot` or `.`. See [configuration](configuration.md).

## Output

On disk:

| `--format` | File |
| --- | --- |
| `html` (default) | `REPORT.html` |
| `markdown` | `REPORT.md` |
| `text` | `REPORT.txt` |

`report.json` is always written (the same data as JSON, including `comparison` (`proposal` or `applied`) and `packageRoot`). A previous human-readable file of another format is removed so only one `REPORT.*` remains.

`REPORT.html` layout: Summary (counts, beefup version, timestamp, comparison label, nested package root when `--package-root` is not `.`) → Security (Introduced → Unresolved → Fixed, with colour-coded severity and version diffs) → Policy → collapsible package diffs → Legend / paths.

Package diffs split optional/platform packages into their own section, bold direct names and italicize transitive ones, use a single Version column for added/removed, and omit path-only churn (same unique versions, different install paths). Meta-vulns from npm audit are kept and labeled `transitive (via …)` instead of blank references. A parent meta-vuln is **introduced** only when it wraps a newly introduced leaf advisory. If npm audit newly lists a parent that only depends on an advisory already present before the upgrade, that row is **unresolved** — the package itself need not have changed. **Unresolved** findings are still open after the upgrade. From-versions are shown in red (struck through in HTML); to-versions in green.

Stdout is automatic colour or plain text: ANSI severity and version colours on a TTY; `NO_COLOR` or a non-TTY stdout falls back to plain text. `FORCE_COLOR` enables colour even when stdout is not a TTY.

Introduced findings print a stderr warning pointing at `.beefup/staged` (proposal) or `.beefup/prior` vs live (applied).

## Failures

Report **fails** when there is no staged or prior lockfile, Safe Chain is missing (unless `--no-safe-chain`), cve-lite cannot run, a lockfile cannot be parsed, or the after-tree policy has errors (banned `latest`/`*`, stale override pins, alignment mismatches unless configured to warn).

Introduced findings do **not** fail report. Review them before `beefup accept`.
