ARG VARIANT="26"
FROM mcr.microsoft.com/devcontainers/javascript-node:${VARIANT}

ARG PNPM_VERSION="11.22.0"
ARG SAFE_CHAIN_VERSION="1.5.15"

# Corporate MITM CAs (Perimeter81 / Aikido). .gitkeep is ignored by update-ca-certificates.
COPY ca-certificates /usr/local/share/ca-certificates/local
RUN update-ca-certificates

ENV SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt"
ENV REQUESTS_CA_BUNDLE="/etc/ssl/certs/ca-certificates.crt"
ENV NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt"

# Pinned pnpm standalone binary (Corepack removed from Node 26+; no npm install -g)
RUN set -eux; \
  arch="$(uname -m)"; \
  case "$arch" in \
    x86_64) arch=x64 ;; \
    aarch64) arch=arm64 ;; \
    *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
  esac; \
  curl --proto "=https" --tlsv1.2 -fsSL \
    -o /tmp/pnpm.tar.gz \
    "https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}/pnpm-linux-${arch}.tar.gz"; \
  mkdir -p /usr/local/lib/pnpm; \
  tar -xzf /tmp/pnpm.tar.gz -C /usr/local/lib/pnpm; \
  ln -sf /usr/local/lib/pnpm/pnpm /usr/local/bin/pnpm; \
  rm /tmp/pnpm.tar.gz; \
  pnpm --version

# Safe-chain as `node` so binary + shell aliases land in /home/node (not /root).
USER node
RUN set -eux; \
  curl --proto "=https" --tlsv1.2 -fsSL \
    -o /tmp/install-safe-chain.sh \
    "https://github.com/AikidoSec/safe-chain/releases/download/${SAFE_CHAIN_VERSION}/install-safe-chain.sh"; \
  sh /tmp/install-safe-chain.sh; \
  rm /tmp/install-safe-chain.sh; \
  "${HOME}/.safe-chain/bin/safe-chain" --version
