# azr-mailer

Service HTTP minimaliste (Node / Express / Nodemailer) pour centraliser l’envoi d’e-mails depuis plusieurs frontends ou backends.

## Démarrage local (Docker + MailHog)

```bash
docker compose up --build
```

- API : `http://localhost:3000`
- MailHog UI : `http://localhost:8025`

En dev, `REQUIRE_AUTH=false` est défini dans `docker-compose.yml`. Pour tester l’auth, définissez `AUTH_TOKEN` ou `APP_TOKENS_JSON` et `REQUIRE_AUTH=true`.

## Démarrage local (sans Docker)

```bash
cp .env.example .env
# Éditer .env (SMTP réel ou MailHog sur 1025)
npm install
npm start
```

## Endpoints

| Méthode | Chemin | Description |
|--------|--------|-------------|
| `GET` | `/health` | Liveness : `ok`, `uptime`, `version`, `time`, `requestId` |
| `GET` | `/ready` | Readiness : SMTP configuré (`SMTP_HOST`) |
| `POST` | `/v1/send` | Envoi versionné (contrat stable) |
| `POST` | `/send` | **Déprécié** — même logique, headers `Deprecation` / `Link` |

Préflight CORS : `OPTIONS` sur les chemins concernés répond `204` si l’`Origin` est dans `ALLOWED_ORIGINS`.

## Contrat `POST /v1/send`

Headers :

- `Authorization: Bearer <token>` (recommandé) ; `x-api-key` reste supporté pour compat.
- `Content-Type: application/json`
- Optionnel : `x-request-id` (sinon généré et renvoyé).

Corps JSON (champs supplémentaires **interdits** — schéma strict) :

```json
{
  "appId": "azersoft-nc",
  "from": "contact@example.com",
  "to": "user@example.com",
  "subject": "Sujet",
  "html": "<p>Contenu HTML</p>",
  "replyTo": "support@example.com",
  "meta": { "form": "contact" },
  "clientTs": 1710000000000
}
```

- `appId` : string requis.
- `from` : e-mail expéditeur (aligné sur votre politique SPF/DKIM).
- `to` : e-mail ou tableau d’e-mails (max 50).
- `subject`, `html` : requis (tailles plafonnées côté schéma).
- `replyTo`, `meta`, `clientTs` : optionnels.
- Honeypot : si `HONEYPOT_FIELD` est défini (ex. `company_website`), ce champ doit être absent ou vide.

Réponses homogènes :

- Succès : `{ "ok": true, "requestId": "…" }`
- Erreur : `{ "ok": false, "error": { "code": "…", "message": "…" }, "requestId": "…" }`

## Exemples cURL

```bash
curl -sS "http://localhost:3000/health" | jq .
```

```bash
curl -sS -X POST "http://localhost:3000/v1/send" \
  -H "Content-Type: application/json" \
  -H "Origin: https://allowed.example" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "appId":"demo",
    "from":"from@example.com",
    "to":"to@example.com",
    "subject":"Test",
    "html":"<p>Hello</p>"
  }' | jq .
```

## Variables d’environnement

Voir [`.env.example`](.env.example) pour la liste commentée. Résumé :

| Variable | Obligatoire prod | Défaut / notes |
|----------|------------------|----------------|
| `PORT` | non | `3000` |
| `NODE_ENV` | recommandé | `production` |
| `REQUIRE_AUTH` | oui (défaut `true` si `NODE_ENV=production`) | `false` en dev compose |
| `AUTH_TOKEN` | si pas `APP_TOKENS_JSON` | Bearer / `x-api-key` |
| `APP_TOKENS_JSON` | alternative multi-app | JSON `{"appId":"token",...}` |
| `ALLOWED_APP_IDS` | non | Sous-ensemble d’`appId` autorisés (mode `AUTH_TOKEN`) |
| `APP_FROM_DOMAINS_JSON` | recommandé multi-clients | JSON `{"appId":["domaine.nc",…]}` — domaine exact du `from` |
| `ALLOWED_ORIGINS` | fortement recommandé navigateurs | CSV ; vide = garde `Origin` désactivée (serveur-à-serveur uniquement) |
| `SMTP_HOST` | oui | requis pour `/ready` et envoi |
| `SMTP_PORT` | non | `587` |
| `SMTP_SECURE` | non | `true` ou port `465` |
| `SMTP_USER` / `SMTP_PASS` | selon SMTP | optionnel (ex. MailHog sans auth) |
| `BEHIND_PROXY` | si reverse proxy | `true` pour `trust proxy` + IP correcte |
| `JSON_BODY_LIMIT` | non | `2mb` |
| `RATE_LIMIT_*` | non | fenêtre + max requêtes |
| `HONEYPOT_FIELD` | non | nom du champ piège |
| `CLIENT_TS_MAX_SKEW_MS` | non | `300000` |
| `CAPTCHA_ENABLED` | non | `false` ; si `true` sans implémentation → `501` |
| `LOG_LEVEL` | non | `info` |

## K3s (platform)

Service ClusterIP, namespace `platform` : `http://mail.platform.svc.cluster.local:3000`.

| Env | SMTP | Auth |
|-----|------|------|
| local (k3d) | MailHog `mailhog:1025` | `REQUIRE_AUTH=false` |
| droplet | `mail.smtp.host` in `ci/k3s/values/droplet.yaml` | Secret `platform-mail` |

Image `ghcr.io/azersoft-nc/azr-mailer` is built by [`.github/workflows/publish.yml`](.github/workflows/publish.yml) on push to `main`. Readiness is `GET /ready` (needs `SMTP_HOST`). Liveness stays `GET /health`.

No edge route. Callers are other workloads in the cluster. Public `/mail` on Nginx is the Compose-era path — see [docs/reverse-proxy-mail.md](docs/reverse-proxy-mail.md).

## Reverse proxy (`/mail`)

Public typique : `https://apps.azersoft.nc/mail` → le backend doit recevoir `/v1/send`, pas `/mail/v1/send`. Voir [docs/reverse-proxy-mail.md](docs/reverse-proxy-mail.md).

## Frontend statique (fetch)

```javascript
await fetch("https://apps.azersoft.nc/mail/v1/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_MAILER_TOKEN}`,
  },
  body: JSON.stringify({
    appId: "azersoft-nc",
    from: "contact@azersoft.nc",
    to: ["visitor@example.com"],
    subject: "Merci",
    html: "<p>Message</p>",
  }),
});
```

L’origine de la **page** doit figurer dans `ALLOWED_ORIGINS` (ex. `https://azersoft.nc`).

## Codes d’erreur fréquents

| `error.code` | HTTP | Signification |
|----------------|------|-----------------|
| `invalid_payload` | 400 | JSON invalide / schéma Zod |
| `unauthorized` | 401 | Token manquant ou incorrect |
| `legacy_auth_unsupported` | 401 | Multi-tenant actif sans `AUTH_TOKEN` pour `/send` |
| `origin_not_allowed` | 403 | Header `Origin` présent et non listé |
| `app_forbidden` | 403 | `appId` hors `ALLOWED_APP_IDS` |
| `from_domain_forbidden` | 403 | Domaine de `from` hors `APP_FROM_DOMAINS_JSON` pour cet `appId` |
| `rate_limited` | 429 | Trop de requêtes |
| `smtp_not_configured` | 500 | `SMTP_HOST` absent |
| `auth_misconfigured` | 500 | `REQUIRE_AUTH` sans token configuré |
| `send_failed` | 502 | Échec SMTP (message générique, pas de fuite serveur) |
| `captcha_not_configured` | 501 | `CAPTCHA_ENABLED=true` sans provider |

## Migration `/send` → `/v1/send`

1. Ajouter `appId` et aligner le JSON sur le contrat strict.
2. Utiliser `POST /v1/send` ; en multi-tenant, un secret par `appId` via `APP_TOKENS_JSON`.
3. Retirer `/send` une fois tous les clients migrés (prévoir une version semver où `/send` renvoie `410`).

## Checklist production

- [ ] `REQUIRE_AUTH=true` et `AUTH_TOKEN` ou `APP_TOKENS_JSON`
- [ ] `ALLOWED_ORIGINS` couvre chaque site frontend
- [ ] `BEHIND_PROXY=true` derrière Nginx/Traefik
- [ ] SMTP + SPF/DKIM cohérents avec `from`
- [ ] Limites rate (`RATE_LIMIT_*`) adaptées au trafic
- [ ] Préfixe proxy documenté ([docs/reverse-proxy-mail.md](docs/reverse-proxy-mail.md))
- [ ] Ne pas versionner `.deploy` / secrets ; rotation si fuite

## Tests

```bash
npm test
```

Les tests utilisent un transport SMTP mock (pas de réseau).

## Multi-clients : domaines `from`

Quand plusieurs sites envoient via le même mailer, configurez :

1. `APP_TOKENS_JSON` — un secret par `appId`
2. `APP_FROM_DOMAINS_JSON` — domaines autorisés en `from` pour chaque `appId` (match exact, sans sous-domaines implicites)

Exemple :

```bash
APP_TOKENS_JSON='{"client-a":"secret-a","client-b":"secret-b"}'
APP_FROM_DOMAINS_JSON='{"client-a":["client-a.nc"],"client-b":["client-b.com","mail.client-b.com"]}'
```

Si `APP_FROM_DOMAINS_JSON` est défini, un `appId` absent de la map ou un `from` hors liste → `403 from_domain_forbidden`.

Plan Postfix outbound (cluster) + script DNS : [docs/azr-ci-outbound-postfix-plan.md](docs/azr-ci-outbound-postfix-plan.md).

## Phase 2 (idées)

- Fournisseur captcha réel + secret serveur
- Allowlist domaines `to` par `appId`
- Métriques Prometheus / OpenTelemetry
- Endpoint `text` ou pièces jointes bornées
