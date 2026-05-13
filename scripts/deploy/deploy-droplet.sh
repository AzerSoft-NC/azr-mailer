#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=scripts/deploy/_helpers.sh
source "$SCRIPT_DIR/_helpers.sh"

if [[ -f "$ROOT_DIR/.deploy" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.deploy"
  set +a
fi

DROPLET_IP="${DROPLET_IP:-}"
DROPLET_USER="${DROPLET_USER:-}"
DROPLET_PWD="${DROPLET_PWD:-}"
DEPLOY_BASE="${DEPLOY_BASE_PATH:-}"

if [[ -z "$DROPLET_IP" || -z "$DROPLET_USER" || -z "$DROPLET_PWD" ]]; then
  echo "Erreur : .deploy doit définir DROPLET_IP, DROPLET_USER et DROPLET_PWD."
  exit 1
fi

if ! command -v sshpass >/dev/null 2>&1; then
  echo "Erreur : sshpass est requis (ex. sudo apt install sshpass)."
  exit 1
fi

if [[ ! -d "$ROOT_DIR/dist" ]]; then
  echo "Erreur : dossier dist/ absent. Lancez yarn build avant deploy-droplet."
  exit 1
fi

VERSION="$(deploy_read_version "$ROOT_DIR")"
deploy_validate_semver "$VERSION"

REMOTE_VERSION_DIR="${DEPLOY_BASE}/${VERSION}"
SSH_TARGET="${DROPLET_USER}@${DROPLET_IP}"
SSH_COMMON=(ssh -o StrictHostKeyChecking=accept-new)

echo "Déploiement ${VERSION} -> ${SSH_TARGET}:${REMOTE_VERSION_DIR}"
echo "Lien symbolique final : ${DEPLOY_BASE}/current -> ${REMOTE_VERSION_DIR}"

sshpass -p "$DROPLET_PWD" "${SSH_COMMON[@]}" "$SSH_TARGET" "mkdir -p \"${REMOTE_VERSION_DIR}\""

sshpass -p "$DROPLET_PWD" rsync -avz --delete \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$ROOT_DIR/dist/" "${SSH_TARGET}:${REMOTE_VERSION_DIR}/"

sshpass -p "$DROPLET_PWD" "${SSH_COMMON[@]}" "$SSH_TARGET" \
  "ln -sfn \"${REMOTE_VERSION_DIR}\" \"${DEPLOY_BASE}/current\""

echo "Terminé — nginx peut servir root ${DEPLOY_BASE}/current"
