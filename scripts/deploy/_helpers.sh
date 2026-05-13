#!/usr/bin/env bash
# Shared helpers for deploy/*.sh (semver, package.json).
set -euo pipefail

deploy_read_version() {
  local root_dir="${1:-}"
  if [[ -z "$root_dir" || ! -f "$root_dir/package.json" ]]; then
    echo "Erreur: package.json introuvable dans $root_dir" >&2
    return 1
  fi
  node -e "const p=require(process.argv[1]); if(!p.version){throw new Error('version manquante')}; console.log(String(p.version));" "$root_dir/package.json"
}

deploy_validate_semver() {
  local v="${1:-}"
  if [[ ! "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Erreur: version semver invalide '$v' (attendu: x.y.z)" >&2
    return 1
  fi
}

deploy_bump_semver() {
  local current="${1:-}"
  local kind="${2:-patch}"
  deploy_validate_semver "$current"
  node -e "
const [maj, min, pat] = process.argv[1].split('.').map(Number);
const kind = process.argv[2];
if (kind === 'minor') {
  console.log(\`\${maj}.\${min + 1}.0\`);
} else {
  console.log(\`\${maj}.\${min}.\${pat + 1}\`);
}
" "$current" "$kind"
}

deploy_set_package_version_semver() {
  local root_dir="${1:-}"
  local next_version="${2:-}"

  if [[ -z "$root_dir" || ! -f "$root_dir/package.json" ]]; then
    echo "Erreur: package.json introuvable dans $root_dir" >&2
    return 1
  fi

  deploy_validate_semver "$next_version"
  node -e "
const fs = require('fs');
const file = process.argv[1];
const version = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.version = version;
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
" "$root_dir/package.json" "$next_version"
}
