#!/usr/bin/env bash
set -euo pipefail

echo "This script does not deploy azr-mailer. Use GHCR + Helm (ci/k3s). See scripts/deploy/README.md" >&2
exit 1
