# Configuration

Everything is an environment variable. Defaults make `docker run` with one volume work.

| Variable | Default | Meaning |
|---|---|---|
| `HOST`, `PORT` | `0.0.0.0`, `8080` | listen address |
| `BASE_URL` | – | the address browsers use (`https://hub.example.com`). Needed for sign-in: the OIDC callback is `BASE_URL/api/v1/auth/oidc/callback` |
| `DATA_DIR` | `./data` | SQLite file, Core token, backups |
| `DB_PATH` | `DATA_DIR/pocket-hub.db` | |
| `LOG_LEVEL`, `LOG_FORMAT` | `info`, `text` | `debug` logs every request; `json` for a log shipper |
| `TRUST_PROXY` | `true` | take the client IP from `X-Forwarded-For` |
| `METRICS_ENABLED` | `true` | `/metrics` (Prometheus) |
| `AUTH_MODE` | `local` | `local` (sessions) or `none` (everyone is the first user; development only) |
| `SESSION_TTL` | `720h` | browser session length |
| `SECURE_COOKIES` | `false` | set `true` behind HTTPS |
| `PASSWORD_LOGIN` | `true` | allow email + password next to *Sign in with Pocket Core*. `false` = Core only, no setup page |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | – | bootstrap the first account from the environment (only while there are no users) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_NAME`, `OIDC_AUTO_CREATE` | – | an explicit OpenID Connect provider. Not needed with Core: the hub uses the client Core issues at registration. When set, they win. Note that a non-Core provider cannot give the hub tokens for Core, so the launcher then asks the person to connect to Core once more |
| `CORE_URL` | – | Pocket Core as the hub reaches it (`http://pocket-core:8080`, `http://host.docker.internal:8179`) |
| `CORE_REGISTRATION_KEY` | – | from Core → Settings. Used once; the app token Core mints is kept in `DATA_DIR/core.token` |
| `CORE_APP_URL` | `BASE_URL` | how Core reaches the hub for health checks |
| `CORE_PUBLIC_URL` | Core's issuer | what the *Pocket Core* tile opens |
| `REFRESH_SECONDS` | `45` | how often an open tab re-reads the launcher (minimum 10) |

## Tokens the hub keeps

- `DATA_DIR/core.token`: the hub's own `pca_` app token, and next to it `core.token.oidc.json` with the OIDC client Core issued.
- `core_grants` in the database: for each browser session, the person's own Core access and refresh tokens from *Sign in with Pocket Core*. They let the hub read that person's launcher as them. Signing out deletes the session and the grant; a refresh Core refuses deletes the grant and the desk asks the person to connect again.

Keep `DATA_DIR` at mode 0700 and back it up with `pocket-hub backup` (a consistent SQLite copy) or by snapshotting the `.db` with SQLite's backup API.

## API

Base path `/api/v1`. The session cookie, or `Authorization: Bearer <Core token>` (`pcd_`, `pcu_`, `pco_`; validated through Core's introspection). Errors are `{"error": "…"}`.

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/status` | `needs_setup`, `authenticated`, `user`, `oidc`, `oidc_name`, `password_login`, `core`, `version` |
| GET | `/auth/oidc/start?next=` · `/auth/oidc/callback` | Sign in with Pocket Core (or the `OIDC_*` provider) |
| POST | `/auth/login` · `/auth/setup` · `/auth/logout` | password paths, present when `PASSWORD_LOGIN=true` |
| GET/PUT | `/auth/me` | `{user, core_linked}`; PUT `{name, current_password, new_password}` |
| GET | `/launcher` | `{me, prefs, core: ok\|reconnect\|unconfigured\|unreachable, apps:[tile], box:{name, core_url, core_version, core_uptime_s, counts, apps_up, apps_checked}, refresh_seconds}` |
| GET | `/activity` | `{events:[…], scope: box\|mine\|none}`, at most 100, newest first, already filtered for the caller |
| GET/PUT | `/prefs` | the caller's layout as one JSON object (≤ 64 KiB): `wallpaper`, `wallpaper_url`, `density`, `labels`, `group`, `clock24`, `order`, `dock`, `hidden` |
| GET | `/system` | hub version, uptime, Core registration state |
| GET | `/healthz` · `/readyz` · `/metrics` | outside `/api/v1` |

A tile: `{key, id, type, slug, name, group, url, open_url, icon, pocket, status, version, description, last_seen_at, last_error, publishes}`. `key` is stable per Core service row and is what `prefs.order`, `dock` and `hidden` refer to.

## CLI

```
pocket-hub                        start the server (default)
pocket-hub backup [-o FILE]       write a consistent SQLite backup
pocket-hub version
```
