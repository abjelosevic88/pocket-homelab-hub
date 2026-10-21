# Today and quick capture

Today brings together the signed-in person's Tasks, Habits, Kitchen and Notes. It is available in the main navigation and from Home. The gallery also offers **Tasks today**, **Habit progress**, **Meal plan** and **Recent notes** widgets, making 19 widget types in total. Existing home layouts are preserved; people choose whether to add these four.

- Tasks: actual today, overdue and completed-today counts, plus the app's next tasks. Dates follow the person's Tasks time zone.
- Habits: scheduled habits, check-in state and done/total for the browser's local date.
- Kitchen: today's planned meals, using the browser's local date.
- Notes: six recently modified note titles and their folders, without full note contents.

Summaries refresh once a minute while the window is visible and on returning to it; Refresh today requests another read. Each source has its own unavailable state, rather than silently turning failure into zero counts. No personal summary is cached on the Hub server. The browser holds only the current signed-in session's summary. Cards and widgets open the corresponding app inside the persistent workspace; they do not yet navigate to a specific record or complete tasks/check in habits inline.

**Capture** is available in the top bar from Home, Today or an open app, and with Ctrl/Command+Shift+K when Hub has keyboard focus. Embedded apps receive their own keystrokes, so the top-bar control remains the reliable action while working inside a frame. Customers can create:

- A task in Pocket Tasks, with a title, optional details and an optional due date. The app chooses its normal destination list.
- A note in Pocket Notes, with a title and body.
- A journal moment in Pocket Day, with text and a selected date.

The customer chooses the type and sees the destination before saving. This is a text capture flow; attachments, dictated audio and link classification are not included. Closing capture or changing pages within Hub preserves an unfinished draft in memory. It is cleared on reload/sign-out. Browser departure prompts while a draft is unfinished where supported. No draft text is placed into local storage or Hub's database. A successful capture creates an ordinary record owned by the person in the chosen app.

## Identity and destination boundaries

`GET /api/v1/daily?date=YYYY-MM-DD` and `POST /api/v1/capture` require normal Hub authentication. Hub acts as a first-party client with the person's own Core token, as the companion app does. It does **not** substitute an owner credential or Hub's registration token for personal app reads/writes. Downstream apps introspect the token and enforce their own audience/account rules. This is distinct from background app-to-app delegation through Core's Links feature; Hub does not change link switches or grant itself new link permissions.

Before a read or capture, Hub fetches the current person's Core service audience and the current registered app list. A supported service must be marked Pocket, have a supported type/slug, and its public base URL must exactly match that registered app. Only HTTPS destinations are supported, except loopback HTTP for local development. URLs containing userinfo, a query or a fragment are rejected. Redirects are never followed with the user's token. There is no caller-supplied URL or generic proxy route. App errors are summarized without returning backend diagnostics or unrelated fields.

The adapters are deliberately fixed: Tasks `/dashboard` and POST `/tasks`; Habits `/days/{date}`; Kitchen `/plan`; Notes GET/POST `/notes`; Day POST `/moments`. Adding another adapter requires a reviewed endpoint and response mapping in `internal/server/daily.go` or `capture.go`.

## Reliable capture

A capture includes a unique request ID, destination, kind and content. `capture_requests` stores a per-user request ID, content digest, status and minimal receipt. It does not store task/note/journal text. Reserving the ID is atomic. Retries with the same ID and body replay the receipt; changed content with that ID is rejected. Audience is checked again even when replaying a receipt.

Once an outbound write starts, Hub gives it a bounded chance to finish and record the receipt even if the browser disconnects. A timeout, ambiguous upstream failure or server interruption is marked uncertain; Hub does not resend that mutation. The UI offers **Check saved status** with the same ID and **Check app**. The customer must inspect the app before explicitly starting a new capture when no receipt is available. This avoids pretending an app without an idempotency protocol can provide exactly-once delivery. Explicit 4xx refusals can be retried as a new attempt; Hub does not retry automatically.

Receipts remain in SQLite across restarts and are deleted with their owning user. There is no user-facing receipt history yet. Normal Box backups include the additional table.

## Validation

Go tests cover user-token forwarding, separate account summaries, fresh audience revocation, exact registered destinations, rejected redirects, partial and malformed source responses, capture validation and durable receipts, simultaneous duplicate submissions, changed-body conflicts and uncertain outcomes. Browser tests cover Today, capture inside an open app, draft retention, task/note/journal destinations, unavailable connections, retry identity, connected widgets, mobile layout and existing workspace/widget behavior. Customer data is not used for synthetic write tests.
