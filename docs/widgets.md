# Personal home widgets

Open Home → **Add widgets** to browse 19 kinds. Choose a size in the live preview, then add. Widgets with personal content open their editor immediately. **Edit home** exposes drag handles, size selectors, customization and removal. Handles work with mouse and touch; arrow keys move one position, Home/End move first/last, and explicit earlier/later buttons provide an alternative. Grid order follows reading order across desktop, tablet and phone layouts.

Each account can have up to 24 widgets, including multiple copies of a kind. A clock for home and another for family abroad, for example, have independent titles and time zones. Home options can hide the spaces or app grid; the library and search remain available. Removing all widgets deliberately leaves an empty board. Restore starter widgets is reversible with the current session’s undo action. Undo restores the immediately preceding widget layout and contents. Making a subsequent widget edit clears that undo to protect newer changes.

| Widget | Source and behavior |
| --- | --- |
| Tasks today | Live personal Tasks due counts and next tasks; app time zone. |
| Habit progress | Personal scheduled habits and check-ins for the browser’s local date. |
| Meal plan | Personal Kitchen plan for the browser’s local date. |
| Recent notes | Recent personal Notes titles; full note content is not read. |
| Clock | Device time; analog/digital; optional IANA time zone; follows the 24-hour preference. |
| Calendar | Local month calendar with previous/next/today navigation. No appointments integration. |
| Focus | Existing account-scoped browser timer; start, pause and resume from Home or open the focus room. |
| Favorites | Current dock preferences, resolved against apps available to the account. |
| Recently opened | Account-scoped history in this browser; unavailable apps are excluded. |
| Activity | Existing authorized activity endpoint. No additional permissions or service polling. |
| Space | A built-in or custom space, resolved against currently visible apps. |
| App shortcut | A selected available app; opens in the persistent workspace. Removed access yields an unavailable state. |
| Quick note | Up to 500 characters saved in this account’s Hub preferences. |
| Checklist | Up to 12 items, 100 characters each; inline additions and checkboxes, full list editing in Customize. Independent of Pocket Tasks. |
| Countdown | Calendar days to a personal date, using the device’s local date; handles past dates and daylight saving changes. |
| Photo frame | Direct HTTPS image URL loaded by the browser without a referrer. Failed images offer a change action. Local upload and photo-library integration are not included. |
| App health | Latest provided checks for this account’s available apps; unchecked apps remain separately labeled. |
| Your Box | Live Box name, available app count, Core uptime and version when provided. |
| Something to do | Local intent suggestions based on available apps, opening a matching app inside the workspace. |

Widget definitions, sizes and configuration types live in `web/src/lib/widgets.ts`; rendering, gallery, editor and board live in `web/src/components/widgets/`. Styling is in `web/src/widgets.css`. Add a definition, renderer and any configuration fields to introduce another kind. Unknown kinds are ignored; malformed configuration is normalized before rendering. A missing saved board receives starter widgets; an empty saved array stays empty.

Layout and contents use the existing per-person `/api/v1/prefs` endpoint (`home_widgets`, `home_show_spaces`, `home_show_apps`). The preference payload limit is 256 KiB to accommodate full checklists in multibyte scripts. No migration or shared customer-content table is introduced. Saving is debounced and serialized; failures preserve pending edits and expose retry, refresh cannot overwrite pending edits, and sign-out waits for successful saving. A browser departure with pending changes prompts before leaving where supported. Like other preferences, concurrent edits from separate devices are last-write-wins; this is not collaborative document editing.

Widget layout syncs through the account; recent apps and the focus timer remain browser-local. Activity uses the home screen’s shared refresh; widgets do not independently poll services. The four connected widgets use the shared Today refresh; remaining app widgets derive data from the current launcher. See [Today and capture](daily-and-capture.md). The shared clock updates every 15 seconds. No weather, appointment or storage figures are fabricated. Task figures come from the real personal Tasks API. Further integrations require per-person app contracts.
