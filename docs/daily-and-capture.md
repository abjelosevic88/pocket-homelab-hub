# Today and quick capture

Today brings together what the signed-in person's apps have for them. It is available in the main navigation and from Home (which shows the first six cards). The gallery also offers **Tasks today**, **Habit progress**, **Meal plan** and **Recent notes** widgets, and one widget for every other app that has a summary. Existing home layouts are preserved; people choose what to add.

- Tasks: actual today, overdue and completed-today counts, plus the app's next tasks. Dates follow the person's Tasks time zone.
- Habits: scheduled habits, check-in state and done/total for the browser's local date.
- Kitchen: today's planned meals, using the browser's local date.
- Notes: six recently modified note titles and their folders, without full note contents.

## Any app that says so

Hub does not keep a list of the apps it can show or capture into. An app declares it in the manifest it registers with Pocket Core (Core `docs/capabilities.md`). Hub asks Core who offers what to the signed-in person (`GET /api/v1/links/status?user=&scope=`, remembered for 45 seconds per person) and reaches each app through a Core link (see *Identity and destination boundaries*):

- `widget: {title, what}`: the app is a source of `/daily`. Hub asks `GET {app}/api/v1/pocket/widget` with a link token for `pocket:widget` and passes on the line, up to four numbers, up to eight rows and the place the widget is about. The card and the widget carry the title the app gave.
- `capture: {kinds: [{kind, label, what, fields}]}`: every kind is a destination. Hub posts `{request_id, kind, title, text, due, date}` to `{app}/api/v1/pocket/capture` with a link token for `pocket:capture` and expects `201 {id, title, url}`. Only the fields the kind lists (`title`, `due`, `date`) are sent besides the text.
- `category` (read from the registry, `GET /api/v1/apps`): the shelf the app sits on in Home and Apps. Hub has eight shelves (Everyday, Money, Photos & media, Files & work, Life & places, Tools, Downloads, Your box) and takes the app's word when it names one of them or is a common word for one, in any case: home, family, health, life, travel, places → Life & places; work, documents, files → Files & work; media, photos, music, video, books, reading → Photos & media; finance → Money; system, box → Your box; utilities → Tools. Any other word leaves the app where Hub's own table (`web/src/lib/categories.ts`) puts it.

What `/daily` answers for such an app, next to the fields it always had:

```jsonc
{ "sources": [ { "app_key": "garden-12", "kind": "garden", "name": "Pocket Garden", "icon": "https://…/favicon.svg",
                 "title": "Garden today", "what": "What needs water and what is ready to pick",   // from the manifest
                 "state": "ready", "line": "2 beds need water", "url": "https://…/today",
                 "figures": [ { "label": "Beds", "value": "3" }, { "label": "Watered", "value": "1 of 3" } ],  // every number, as worded
                 "metrics": [ { "label": "Beds", "value": 3 } ],                                               // the whole numbers only
                 "items": [ { "id": 7, "ref": "7", "title": "Tomatoes", "detail": "water today", "url": "https://…/bed/7" } ] } ],
  "more": [ { "app_key": "shed-14", "kind": "shed", "name": "Pocket Shed", "title": "Shed" },                  // has a widget, not asked this time
            { "app_key": "barn-15", "kind": "barn", "name": "Pocket Barn", "title": "Barn",
              "off": "You switched this off in Pocket Core. You can switch it back on there, in Settings under Apps acting for me." } ],  // link off: not asked, and why
  "destinations": [ { "app_key": "garden-12", "kind": "garden", "name": "Pocket Garden",
                      "capture_kind": "sowing", "label": "Sowing", "what": "A new row in your sowing diary", "fields": ["title", "date"] } ] }
```

- Older clients keep working: `kind` is still the app's type, `metrics[].value` and `items[].id` are still numbers. A number the app worded ("1 of 3") is only in `figures`; an id that is not a whole number is in `ref`, and `id` is then a negative position.
- An app whose link is off for the person is not asked: no token, no call. It is listed in `more` with `off`, a sentence that says which switch in Pocket Core it is (the person's own, or the box-wide one), so its widget in the gallery and on Home explains why it is empty. Quick capture leaves such an app out. An app the person may not use at all is not mentioned.
- An app that is linked for the person but not on their launcher list still works. Its `app_key` is then its slug and it carries `app_url`; Hub opens it in a new browser tab.
- Addresses the app sends (`url`) are made absolute and kept only when they are inside that app; a row with an address opens it in the app's workspace tab, through the app's sign-in start when its tile has one (`…/auth/oidc/start?next=/bed/7`), so the item opens with the person signed in.
- One request asks at most 24 apps, in parallel, eight seconds each: the apps named in `want` (the widgets on the person's Home) first, then Tasks, Habits, Kitchen and Notes, then the rest by name. Apps beyond that are listed in `more` and are asked once their widget is on Home. One app failing never fails the others.
- A capture answers `{status: "saved", app_key, kind, id, item_id, title, url}`; `id` stays a number (0 when the app's id is not one) and `item_id` is the app's own id. When the app answers 400, its sentence is passed on as `{status: "failed", error}` with status 400, so the person reads what to fix. When Core refuses the token (the link was switched off a moment ago), nothing is sent and the receipt says which switch it is.
- In the capture window the task, the note and the journal moment come first; everything else is under **More**, grouped by app.

Tasks, Habits, Kitchen, Notes and Day have a hand-written adapter (below). It is used for a version of the app that does not offer the capability, and for a person whose link to the app is off. When the app offers it and the link is on, Hub uses the link only. Two cases still end at the adapter: Core refuses the token (the link was switched off since Hub last asked), or the route answers 404 or 405 (Core's copy of the manifest is ahead of the version that runs). A task, a note and a journal moment keep their hand-written route in the same way.

Summaries refresh once a minute while the window is visible and on returning to it; Refresh today requests another read. Each source has its own unavailable state, rather than silently turning failure into zero counts. No personal summary is cached on the Hub server. The browser holds only the current signed-in session's summary. Cards and widgets open the corresponding app inside the persistent workspace, at the row's own address when the app sent one; they do not complete tasks or check in habits inline.

**Capture** is available in the top bar from Home, Today or an open app, and with Ctrl/Command+Shift+K when Hub has keyboard focus. Embedded apps receive their own keystrokes, so the top-bar control remains the reliable action while working inside a frame. Customers can create:

- A task in Pocket Tasks, with a title, optional details and an optional due date. The app chooses its normal destination list.
- A note in Pocket Notes, with a title and body.
- A journal moment in Pocket Day, with text and a selected date.

Anything else an app declares it keeps is offered under **More**, with the app's own label and only the fields that kind takes.

The customer chooses the type and sees the destination before saving. This is a text capture flow; attachments, dictated audio and link classification are not included. Closing capture or changing pages within Hub preserves an unfinished draft in memory. It is cleared on reload/sign-out. Browser departure prompts while a draft is unfinished where supported. No draft text is placed into local storage or Hub's database. A successful capture creates an ordinary record owned by the person in the chosen app; when the app sends its address, **Open it** goes straight there.

## Identity and destination boundaries

`GET /api/v1/daily?date=YYYY-MM-DD` and `POST /api/v1/capture` require normal Hub authentication and a person who is signed in through Pocket Core. Hub reaches apps in two ways and never mixes them.

**Through a Core link (any app that offers a widget or quick capture).** Hub's manifest carries two rules, "this scope in every app that offers it": `pocket:widget` and `pocket:capture`. An admin switches each rule on once in Pocket Core → Links → Pocket Hub; Core then keeps a link per app, new apps included. Each link has its own switch for the box (same page) and for each person (Pocket Core → Settings → Apps acting for me). For every read and every capture Hub asks Core for a fresh link token for the person's Core email: it works only in that app, only for that scope (one route, one method), for five minutes, and Core refuses it the moment a switch is off. Core names the app's address with the token. Hub never keeps a token. The app records "hub" as the acting app itself.

**With the person's own Core token (Tasks, Habits, Kitchen, Notes and Day only).** The hand-written adapters act as a first-party client with the person's own token, as the companion app does. That token works as the person in every app, so it goes nowhere else: never to a capability route (`/api/v1/pocket/*`), never to an app outside these five. Before each use Hub fetches the person's Core service audience and the registered app list; the service must be marked Pocket and its public base URL must exactly match the registered app. Only HTTPS destinations are supported, except loopback HTTP for local development. URLs containing userinfo, a query or a fragment are rejected. Redirects are never followed with the person's token.

Hub does **not** substitute an owner credential or its registration token for personal app reads/writes. There is no caller-supplied URL or generic proxy route. App errors are summarized without returning backend diagnostics or unrelated fields; the one exception is the sentence an app sends with a 400 on capture, which is meant for the person.

The routes are fixed: the two capability routes (`/api/v1/pocket/widget`, `/api/v1/pocket/capture`) through links, and the hand-written adapters: Tasks `/dashboard` and POST `/tasks`; Habits `/days/{date}`; Kitchen `/plan`; Notes GET/POST `/notes`; Day POST `/moments`. No further adapter is needed for a new app: it offers the capability.

Without Pocket Core, with an older Core that does not know the rules, or while the rules are off, nothing changes: the five apps are read as before and no other app is asked.

## Reliable capture

A capture includes a unique request ID, destination, kind and content. `capture_requests` stores a per-user request ID, content digest, status and minimal receipt. It does not store task/note/journal text. Reserving the ID is atomic. Retries with the same ID and body replay the receipt; changed content with that ID is rejected. Audience is checked again even when replaying a receipt.

Once an outbound write starts, Hub gives it a bounded chance to finish and record the receipt even if the browser disconnects. A timeout, ambiguous upstream failure or server interruption is marked uncertain; Hub does not resend that mutation. The UI offers **Check saved status** with the same ID and **Check app**. The customer must inspect the app before explicitly starting a new capture when no receipt is available. This avoids pretending an app without an idempotency protocol can provide exactly-once delivery. Explicit 4xx refusals can be retried as a new attempt; Hub does not retry automatically.

Receipts remain in SQLite across restarts and are deleted with their owning user. There is no user-facing receipt history yet. Normal Box backups include the additional table.

## Validation

Go tests cover apps Hub has no code for (widget mapping, capture body, receipt, the app's own refusal, unknown kinds), that capability routes only ever see a link token and never the person's own, links that are off (not asked, reason given), a link switched off between two refreshes, an app outside the launcher list, the link taking over for first-party apps and the fallback to the adapter, the bound on apps asked per request, user-token forwarding, separate account summaries, fresh audience revocation, exact registered destinations, rejected redirects, partial and malformed source responses, capture validation and durable receipts, simultaneous duplicate submissions, changed-body conflicts and uncertain outcomes. Browser tests cover Today, capture inside an open app, draft retention, task/note/journal destinations, unavailable connections, retry identity, connected widgets, an unknown app's card, widget and capture kinds, a widget whose link is off, an app outside the launcher list, shelves from the app's category, mobile layout and existing workspace/widget behavior. Customer data is not used for synthetic write tests.
