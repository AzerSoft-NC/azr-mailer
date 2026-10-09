# Plan azr-ci : Postfix outbound + domaines clients

> À implémenter dans le repo **azr-ci** (pas dans azr-mailer).  
> Décision produit : envoi seul (pas de réception), Postfix dans le chart `platform`, domaines `From:` multi-clients, DNS géré manuellement, provisioning semi-auto via `just`.

## Objectif

```
Apps  →  azr-mailer (ClusterIP :3000)  →  Postfix outbound (cluster)  →  Internet
              │                              │
              │ APP_TOKENS_JSON              │ DKIM privé par domaine
              │ APP_FROM_DOMAINS_JSON        │
              ▼                              ▼
         allowlist from              SPF/DKIM/DMARC (DNS registrar)
```

- **azr-mailer** : auth par `appId` + allowlist des domaines `from` (`APP_FROM_DOMAINS_JSON`).
- **Postfix** : MTA outbound-only, signe DKIM, relaie vers le MX distant.
- **Opérateur** : ajoute un domaine avec `just add-mail-domain <domaine>`, colle les TXT DNS.

## Hors scope v1

- Réception (IMAP/POP), boîtes utilisateurs, webmail
- Open relay / port 25 public sans auth
- API admin dans azr-mailer pour créer des domaines
- Provider SaaS (SES, Brevo, …)

## Chart `platform` (azr-ci)

### Nouveaux templates (proposition)

| Fichier | Rôle |
|---------|------|
| `templates/postfix.yaml` | Deployment + Service `postfix` (ClusterIP `25` ou `587`) |
| `templates/postfix-config.yaml` | ConfigMap : `main.cf` / `master.cf` outbound-only |
| Secrets DKIM | Un Secret (ou plusieurs) montés sous `/etc/opendkim/keys/<domaine>/` |

### Values (esquisse)

```yaml
# k3s/charts/platform/values.yaml (ajouts)
postfix:
  enabled: false
  image: boky/postfix:latest   # ou image figée / self-built — à choisir en implémentation
  imagePullPolicy: IfNotPresent
  # Submission interne uniquement (réseau cluster)
  service:
    port: 587
  # Hostname HELO / myhostname (doit matcher SPF)
  hostname: mail.azersoft.nc
  # Secret contenant les clés DKIM (généré par just add-mail-domain)
  dkimSecret: platform-postfix-dkim
  resources:
    requests:
      cpu: 50m
      memory: 128Mi
    limits:
      memory: 512Mi

mail:
  # Pointer le mailer vers Postfix in-cluster une fois postfix.enabled
  smtp:
    host: postfix          # Service name
    port: "587"
    secure: "false"
```

### Overrides env

| Env | `local.yaml` | `droplet.yaml` |
|-----|--------------|----------------|
| `postfix.enabled` | `false` (garder MailHog) ou `true` pour tester DKIM | `true` |
| `mail.mailhog.enabled` | `true` tant que Postfix local off | `false` |
| `mail.smtp.host` | `mailhog` ou `postfix` | `postfix` |
| IP egress SPF | IP du droplet / NAT | **IP publique stable du droplet** dans le SPF de chaque domaine |

**Critique délivrabilité** : le SPF doit autoriser l’**IP de sortie réelle** des pods. Sur un droplet single-node k3s, c’est en général l’IP du droplet. Documenter et figer (pas de sortie aléatoire multi-node sans SNAT dédié).

### Postfix : comportement attendu

- `inet_interfaces` / écoute seulement dans le cluster (NetworkPolicy optionnelle : seuls les pods `mail` parlent au Service `postfix`)
- Pas de relay ouvert : accepter seulement depuis le CIDR cluster ou auth SMTP interne (`SMTP_USER`/`SMTP_PASS` dans `platform-mail`)
- `mydestination` vide / pas de livraison locale
- OpenDKIM (ou équivalent image) : table `domaine → sélecteur` + clés montées en volume

## Script `just add-mail-domain`

### Signature

```bash
just add-mail-domain client-a.nc [selector=mail]
```

### Étapes

1. Générer paire DKIM (RSA 2048) si absente pour ce domaine.
2. Upsert dans le Secret `platform-postfix-dkim` (et redémarrer / reload Postfix+OpenDKIM).
3. Afficher à coller dans le DNS du domaine :

```text
# SPF (ajuster IP)
client-a.nc.  TXT  "v=spf1 ip4:<DROPLET_IP> -all"

# DKIM
mail._domainkey.client-a.nc.  TXT  "v=DKIM1; k=rsa; p=<PUBLIC_KEY>"

# DMARC (démarrage soft)
_dmarc.client-a.nc.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@azersoft.nc"
```

4. Rappeler la config azr-mailer à mettre à jour :
   - ajouter le domaine dans `APP_FROM_DOMAINS_JSON` pour le bon `appId`
   - s’assurer que `APP_TOKENS_JSON` a l’entrée `appId`

Idempotence : re-run ne régénère pas la clé si elle existe (flag `--rotate` plus tard).

### Emplacement suggéré

- `justfile` : recette `add-mail-domain`
- Script : `k3s/scripts/add-mail-domain.sh` (openssl + kubectl)

## Secret `platform-mail` (existant)

Étendre la doc secrets :

| Clé | Usage |
|-----|--------|
| `auth-token` / `app-tokens-json` | déjà câblé sur le Deployment `mail` |
| `smtp-user` / `smtp-pass` | auth vers Postfix si activée |
| **nouveau** (mailer) | `app-from-domains-json` → env `APP_FROM_DOMAINS_JSON` |

Mettre à jour `templates/mail.yaml` pour monter `APP_FROM_DOMAINS_JSON` depuis le secret (comme `APP_TOKENS_JSON`).

## Ordre d’implémentation recommandé (azr-ci)

1. Template Postfix outbound + values local/droplet ; NetworkPolicy minimale.
2. Secret DKIM + montage ; un domaine de test (ex. `azersoft.nc`).
3. `just add-mail-domain` + doc DNS.
4. Brancher `mail.smtp.host=postfix` sur droplet ; retirer MailHog.
5. Ajouter `APP_FROM_DOMAINS_JSON` au Deployment `mail` / secrets helpers.
6. Smoke : `POST /v1/send` depuis un job in-cluster → boîte externe → headers DKIM/SPF pass.

## Checklist go-live droplet

- [ ] `postfix.enabled=true`, MailHog off
- [ ] IP publique documentée dans chaque SPF
- [ ] DKIM OK (`dig TXT mail._domainkey.<domaine>`)
- [ ] DMARC en `p=none` puis durcir
- [ ] `platform-mail` : tokens + `app-from-domains-json` + SMTP vers Postfix
- [ ] PTR / HELO cohérents si possible (`mail.azersoft.nc`)
- [ ] Port 25/587 sortant non bloqué chez l’hébergeur

## Lien azr-mailer

L’API refuse déjà un `from` hors allowlist (`from_domain_forbidden`). Sans Postfix + DNS, les mails partent mal ou en spam — les deux repos doivent avancer ensemble pour la prod multi-clients.
