# Deploy

Production path is the workspace Helm chart, not these shell scripts.

1. Push `main` (or a `v*` tag). Workflow [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml) builds `ghcr.io/azersoft-nc/azr-mailer`.
2. From `azr-workspace/ci`: `just deploy local` or `just deploy droplet`.
3. Chart: `ci/k3s/charts/platform` (`templates/mail.yaml`, `templates/mailhog.yaml`).
4. In-cluster URL: `http://mail.platform.svc.cluster.local:3000`.

`deploy.sh` and `deploy-droplet.sh` exit immediately. They targeted a static site (`yarn build`, rsync to `/var/www`) and do not deploy this service.

Droplet SMTP host is `mail.smtp.host` in `ci/k3s/values/droplet.yaml` (empty until set). Credentials stay in Secret `platform-mail`.
