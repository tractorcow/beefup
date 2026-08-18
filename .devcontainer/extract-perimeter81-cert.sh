#!/bin/bash
# Script to extract corporate CA certificates from macOS keychain
# This must be run on the host machine (macOS) before building the dev container
# Usage: ./extract-perimeter81-cert.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/ca-certificates"

# Create ca-certificates directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Purpose: Docker build HTTPS is MITM'd by corporate proxies (Perimeter81 and/or
# Aikido Endpoint Protection). Without these roots in the image trust store,
# corepack/npm fetches fail with UNABLE_TO_GET_ISSUER_CERT_LOCALLY.
certs=(
    "Perimeter81 Secure Web Gateway CA:perimeter81-secure-web-gateway-ca"
    "Perimeter81 Secure Web Gateway 2:perimeter81-secure-web-gateway-2"
    "Aikido Endpoint Protection Root CA:aikido-endpoint-protection-root-ca"
)

extracted_count=0

split_certificates() {
    local cert_name="$1"
    local cert_prefix="$2"
    local combined_cert_file="$3"
    local cert_count

    cert_count="$(grep -c "BEGIN CERTIFICATE" "$combined_cert_file")"

    if [ "$cert_count" -eq 0 ]; then
        echo "⚠️  Certificate file is empty for: $cert_name"
        return
    fi

    rm -f "$CERT_DIR/${cert_prefix}.crt" "$CERT_DIR/${cert_prefix}"-*.crt

    if [ "$cert_count" -eq 1 ]; then
        mv "$combined_cert_file" "$CERT_DIR/${cert_prefix}.crt"
        echo "✓ Certificate extracted successfully to: $CERT_DIR/${cert_prefix}.crt"
        extracted_count=$((extracted_count + 1))
        return
    fi

    awk -v output_dir="$CERT_DIR" -v cert_prefix="$cert_prefix" '
        /BEGIN CERTIFICATE/ {
            cert_index += 1
            output_file = sprintf("%s/%s-%02d.crt", output_dir, cert_prefix, cert_index)
        }

        output_file {
            print > output_file
        }

        /END CERTIFICATE/ {
            close(output_file)
            output_file = ""
        }
    ' "$combined_cert_file"

    rm -f "$combined_cert_file"
    echo "✓ Extracted $cert_count matching certificates for: $cert_name"
    extracted_count=$((extracted_count + cert_count))
}

for cert in "${certs[@]}"; do
    cert_name="${cert%%:*}"
    cert_prefix="${cert#*:}"
    cert_output="$(mktemp)"

    echo "Extracting $cert_name certificate..."

    # Extract all matching certificates from macOS keychain. Multiple certs can share
    # a common name after corporate CA rotations, so each certificate is split out.
    if security find-certificate -a -c "$cert_name" -p > "$cert_output" 2>/dev/null; then
        split_certificates "$cert_name" "$cert_prefix" "$cert_output"
    else
        echo "⚠️  Certificate not found in keychain: $cert_name"
        rm -f "$cert_output"
    fi
done

if [ "$extracted_count" -eq 0 ]; then
    echo "Error: Failed to find any corporate CA certificates in keychain"
    echo "  Make sure you are running this on macOS and the certificates are installed in your keychain"
    exit 1
fi

# Purpose: security(1) may write keychain exports as 0600; the container's non-root
# node user and /etc/ssl/certs symlinks need world-readable cert files.
chmod a+r "$CERT_DIR"/*.crt 2>/dev/null || true

echo "Extracted $extracted_count certificate(s). These files will be used by the dev container during build."
