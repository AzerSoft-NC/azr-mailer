# Deployment (DigitalOcean + Nginx)

Scripts : **`scripts/deploy/`** (racine du dépôt = deux niveaux au-dessus de ce dossier).

## 1) Prepare droplet

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx rsync sshpass
```

Arborescence cible (créée au premier déploiement) :

```text
/var/www/azersoft/
  current          -> symlink vers la dernière version (ex. …/3.0.1)
  3.0.0/
  3.0.1/
  …
```

Le site statique est synchronisé dans `/var/www/azersoft/<version>/` (semver depuis `package.json` après l’étape release). Le lien `current` est mis à jour à chaque déploiement. Les anciennes versions restent pour rollback manuel.

```bash
sudo mkdir -p /var/www/azersoft
sudo chown -R $USER:$USER /var/www/azersoft
```

## 2) Configuration web du droplet

La configuration Nginx ou équivalente n’est pas prise en charge par ce projet, mais elle doit être en place avant le déploiement.

## 3) Configure `.deploy`

```bash
cp .deploy.example .deploy
```

Renseigner au minimum :

```bash
DROPLET_IP=…
DROPLET_USER=…
DROPLET_PWD="…"
DEPLOY_BASE_PATH=…
```

Connexion : **`sshpass`** + mot de passe (comme demandé). Pas de `DEPLOY_SSH_TARGET` : l’orchestrateur lit uniquement ces variables.

## 4) Full deploy pipeline

Depuis la racine du dépôt :

```bash
chmod +x scripts/deploy/*.sh
./scripts/deploy/deploy.sh
```

### Pipeline order

| Step | Action |
|------|--------|
| 1 | Git clean |
| 2 | Prettier check |
| 3 | Lint, astro check, tests |
| 4 | Bump semver, commit, tag, push |
| 5 | `yarn build` |
| 6 | `deploy-droplet.sh` : rsync `dist/` → `/var/www/azersoft/<version>/`, puis `ln -sfn` **`current`** |

### Flags

- **`--minor`** — bump minor au lieu du patch.

### Checks only

```bash
yarn deploy:check
```

## 5) Déploiement seul (sans pipeline)

Après `yarn build` :

```bash
bash scripts/deploy/deploy-droplet.sh
```

## Prérequis locaux

- `sshpass` installé sur la machine qui lance le déploiement.
