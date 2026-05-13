#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DROPLET_IP:-}" || -z "${DROPLET_USER:-}" || -z "${DROPLET_PWD:-}" || -z "${DEPLOY_BASE_PATH:-}" ]]; then
  echo "Erreur : configurez .deploy voir .deploy.example pour plus d'informations."
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  echo "Erreur : des fichiers ne sont pas commités. Commit ou stash avant le déploiement."
  exit 1
fi
