#!/usr/bin/env bash
# Install the Private Remote plugin from its GitHub release into a DSH profile.
# Usage: ./install.sh [profile] [version]
# Fully quit DeepSeek Harness Desktop before installing into the `desktop`
# profile; that profile must have been initialized by launching Desktop once.
set -euo pipefail

PROFILE="${1:-desktop}"
VERSION="${2:-0.1.0}"
DSH_BIN="${DSH_BIN:-dsh}"
URL="https://github.com/MikyWang/dsh-private-remote/releases/download/v${VERSION}/dsh-private-remote-${VERSION}.tgz"

echo "Installing dsh-private-remote ${VERSION} into profile '${PROFILE}'..."
echo "  ${URL}"
exec "${DSH_BIN}" plugin --profile "${PROFILE}" add "${URL}"
