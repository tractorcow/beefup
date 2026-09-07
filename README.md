# @tractorcow/beefup

CLI for **staged, pinned, audited** npm/pnpm dependency upgrades. A proposed upgrade is written to `.beefup/staged` for review; nothing is applied to the live project until a later accept step.

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/) 11.22.0 (see `packageManager` in `package.json`) or npm 12+
- Git
- [Aikido Safe Chain](https://github.com/AikidoSec/safe-chain) wrapping the package manager

Beefup **will not run** unless Safe Chain is enabled. It looks for `aikido-pnpm` / `aikido-npm`, or `safe-chain`, on `PATH`. That keeps lockfile updates and security scans behind Safe Chain’s malware checks and minimum package age.

### Install Safe Chain

Unix / macOS / Linux (pinned release + installer checksum):

```sh
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.15/install-safe-chain.sh -o /tmp/install-safe-chain.sh \
  && echo "de0565e3d6346407a604e84e639e95fea8758748063da2216bbfdca5feda5dd2  /tmp/install-safe-chain.sh" | sha256sum -c - \
  && sh /tmp/install-safe-chain.sh \
  && rm /tmp/install-safe-chain.sh
```

On macOS without `sha256sum`, use `shasum -a 256 -c -` instead of `sha256sum -c -`.

Then **restart your shell** and verify:

```sh
pnpm safe-chain-verify
# or: npm safe-chain-verify
```

You should see `OK: Safe-chain works!`.

If `pnpm` is already installed, check that its global bin directory is on `PATH`:

```sh
pnpm bin -g
```

If that command reports the directory is missing from `PATH`, run `pnpm setup` and restart the shell.

## Install

```sh
pnpm add --global @tractorcow/beefup
# or: npm install --global @tractorcow/beefup
```

Confirm:

```sh
beefup --version
beefup --help
```

### From a git checkout (development)

```sh
git clone git@github.com:tractorcow/beefup.git
cd beefup
pnpm install --frozen-lockfile
pnpm run build
pnpm add --global .
```

Or from the repo root: `make install && make install-global`.

## Update

```sh
pnpm add --global @tractorcow/beefup@latest
# or: npm install --global @tractorcow/beefup@latest
```

From a git checkout:

```sh
cd /path/to/beefup
git pull
pnpm install --frozen-lockfile
pnpm run build
pnpm add --global .
```

Or: `git pull && make install && make install-global`.

## Uninstall

```sh
pnpm remove --global @tractorcow/beefup
# or: npm uninstall --global @tractorcow/beefup
```

Or: `make uninstall-global`.

## Usage

See [docs/index.md](docs/index.md), [staging](docs/stage.md), and [accept](docs/accept.md).

```sh
beefup stage
beefup stage --mode latest --strategy inplace
beefup stage --format html
beefup report
beefup accept
```
