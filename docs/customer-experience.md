# Pocket Box customer experience

Hub is the product shell customers use, not a server dashboard. Its primary navigation is Home, Apps and Activity. Apps open in an embedded workspace with a persistent app switcher; switching apps or returning Home keeps the frames mounted, including unsaved drafts. Closing an app or reloading the browser ends that in-memory workspace. Hub does not read documents or fields inside other apps.

The home screen adds:

- A personal widget board with 15 widget types, three supported sizes, a searchable gallery with live previews, and touch, mouse and keyboard arrangement. Layout and widget contents save per account; removing or restoring widgets offers undo. See [widgets](widgets.md) for data sources and extension rules.
- Suggested spaces for focus, downtime and everyday life, plus custom spaces saved in the person's Hub preferences.
- Local intent matching: “plan dinner,” “capture an idea,” “listen to music.” It searches available apps; it does not execute tasks or claim to be an AI assistant.
- A recently opened widget backed by a per-user browser-storage key; the history can be cleared in the widget.
- A focus room with 15/25/50 minute sessions, pause/resume, elapsed-time restoration, and cross-tab synchronization. Browser storage is account-scoped; this is not a server-synced timer or an alarm after the browser closes.
- A first-visit guide available from “Make yourself at home,” personal wallpaper and favorites, and recent app activity. The activity widget shows events associated with visible apps and excludes Core infrastructure topics; the full authorized feed remains in Activity.

Core continues to decide service visibility and identity. No shared admin credential is introduced by the workspace. Customer deployments should use Core's audience settings to keep infrastructure administration apps out of ordinary customer profiles.

## Embedding apps

The workspace uses separate app origins, normal app sessions and the existing Core sign-in entry points. Use HTTPS sibling domains under the same site (for example `hub.customer.example`, `tasks.customer.example`, and `core.customer.example`), so the apps' SameSite cookies can participate in sign-in. Do not reverse-proxy arbitrary apps into Hub's own origin: their JavaScript would gain access to Hub's browser storage and APIs.

Pocket apps currently permit embedding. Third-party apps may reject frames with `X-Frame-Options` or CSP `frame-ancestors`. Use an app's native trusted-frame setting when available. The included `deploy/pocket-workspace.caddy` snippet is an explicit per-vhost alternative, based on [Caddy's deferred response-header operations](https://caddyserver.com/docs/caddyfile/directives/header). It replaces only frame ancestry, removes the conflicting legacy frame header, and retains the rest of an existing CSP. The additional frame-only policy protects responses that previously had no CSP.

```caddyfile
import /path/to/pocket-workspace.caddy

notes.example.com {
    import pocket_workspace "'self' https://hub.example.com"
    reverse_proxy notes:8080
}

# Keep existing integrations in the ancestor list too.
cloud.example.com {
    import pocket_workspace "'self' https://hub.example.com https://office.example.com"
    reverse_proxy nextcloud:80
}
```

Apply this only to approved app hosts. Do not use a wildcard ancestor or remove the entire CSP. Validate and reload Caddy, then check both response headers and the actual authenticated app in a browser. The workspace sandbox blocks top-level navigation while permitting forms, downloads, explicit popups, scripts and normal app storage. An app that requires a special login window has a help action; HTTP-only URLs receive an explanatory state rather than a mixed-content frame.

A frame load event is not proof that a cross-origin application rendered successfully. Release qualification must exercise sign-in and normal workflows for each app included with a customer box, including any SSO provider reached during redirects. App-specific credentials and authentication behavior are not replaced by Hub. Some providers disallow framed sign-in; configure supported SSO or an app-native integration before including those apps in a promised fully unified customer bundle.

## Verification

`cd web && npm ci && npm run build && npx playwright install chromium && npm run test:e2e`

The browser suite uses synthetic accounts and app frames. It checks intent routing, preserving drafts across app switches, custom spaces, failed saves and retry, timer restoration and account separation, mobile overflow, and keyboard focus. Widget checks cover gallery previews, notes and checklists, calendar countdowns, time zones, pointer and touch arrangement, resize/remove/undo, empty layouts, failed and concurrent saves, revoked apps, photo fallback, malformed preferences, and the 24-widget limit. It never connects to customer services. Set `PLAYWRIGHT_CDP_URL` to use an existing Chromium instance when needed. Go authentication and audience tests remain in `go test ./...`.

The unified workspace is the first product-shell implementation. Native cross-app actions, a single notification inbox, first-boot hardware provisioning, recovery and update management need dedicated Core/app contracts; the home screen does not pretend those capabilities already exist.
