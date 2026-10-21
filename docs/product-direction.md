# Pocket Box: the product people receive

The promise: open one familiar place and get on with your life. Customers should not need to understand containers, service URLs, an identity provider, or how many applications power the experience.

The shipped foundation is the personal home and persistent app workspace described in [customer experience](customer-experience.md). The ideas below are future work, not capabilities advertised by the current UI.

| Next experience | The customer moment | What makes it real |
| --- | --- | --- |
| Today, already assembled | “My appointments, three things to finish, and tonight’s dinner are here when I open my Box.” | Per-person summaries from Day, Tasks, Habits and Kitchen, with freshness and empty states. Read-only first. |
| One place to put anything | “I drop a receipt, an idea or a link here. Pocket offers the right destination.” | A single capture surface with explicit destinations and confirmation, backed by each app’s scoped create API. No silent classification into private records. |
| Useful handoffs | “Turn this recipe into a shopping list,” or “turn these meeting notes into tasks.” | Previewable cross-app actions, preserving provenance, avoiding duplicates and supporting undo where the target app supports it. |
| A quiet personal inbox | “Tell me what matters once, and let me deal with it here.” | Read state, grouping, actionable notifications, per-person routing, and an activity-to-app navigation contract. Events alone are not unread notifications. |
| Spaces that remember the work | “My Sunday planning space brings back the calendar view and the note I was working on.” | App-supported deep links, saved workspace state and an authenticated message bridge for title, theme, navigation and keyboard shortcuts. Never scrape iframe contents. |
| A box that feels cared for | “I can see that my photos are protected, invite someone, and get help without becoming the administrator.” | Actual backup verification, owner/member permissions, recovery flows, update status and a support package customers can review before sharing. |

Build the daily summary and universal capture next: they remove repeated work across apps and create a stronger reason to open Pocket every day. Then add a small number of excellent handoffs, starting with notes → tasks and recipes → shopping. Keep actions explicit and show the resulting records inside the same workspace.

For a customer bundle, choose and qualify a small set of excellent apps. Give the native Pocket apps a common embedded theme and navigation contract before promising that every third-party service behaves identically. Infrastructure tools can remain owner-only through Core’s audience controls.
