# Reverse proxy: `https://apps.azersoft.nc/mail`

The app listens on paths like `/v1/send` and `/health` at the **container root**. If your public URL is prefixed (e.g. `/mail`), configure the proxy to **strip** the prefix so upstream requests hit `/v1/send`, not `/mail/v1/send`.

## Nginx (strip prefix)

```nginx
location /mail/ {
  proxy_pass http://127.0.0.1:3000/;   # trailing slash strips /mail
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Request-Id $request_id;
}
```

Set `BEHIND_PROXY=true` on the mailer container so `express-rate-limit` and `req.ip` use `X-Forwarded-For` correctly.

## Frontend base URL

If the browser calls `https://apps.azersoft.nc/mail/v1/send`, ensure `ALLOWED_ORIGINS` includes the **page origin** (e.g. `https://azersoft.nc`), not necessarily the API host.
