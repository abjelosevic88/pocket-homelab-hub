package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
)

// sourceOf finds one app's part of a /daily answer.
func sourceOf(out map[string]any, key string) map[string]any {
	for _, raw := range out["sources"].([]any) {
		if src := raw.(map[string]any); src["app_key"] == key {
			return src
		}
	}
	return nil
}

// offerOf finds an app that has a widget but was not asked.
func offerOf(out map[string]any, key string) map[string]any {
	for _, raw := range out["more"].([]any) {
		if o := raw.(map[string]any); o["app_key"] == key {
			return o
		}
	}
	return nil
}

var gardenWidget = map[string]any{"category": "Home", "widget": map[string]any{"title": "Garden today", "what": "What needs water and what is ready to pick"}}

// An app Hub has never heard of shows up on its own once it offers a widget:
// Hub finds it through Core, reads it with a link token (never the person's
// own token; the fixture fails the test if that ever reaches the app), and
// puts the answer in the shape /daily has always had. An app that offers
// nothing is left alone.
func TestDailyShowsAnyAppThatOffersAWidget(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 503, map[string]any{}) })
	garden := f.add(t, "garden", gardenWidget, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.URL.Path != "/api/v1/pocket/widget" {
			t.Error("unexpected call to the garden app", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer pcx_ann_garden" {
			t.Error("widget not read with Ann's link token for the garden", r.Header.Get("Authorization"))
		}
		if r.Header.Get("X-Pocket-Source") != "" {
			t.Error("a link token says who acts; no source header is sent with it")
		}
		writeJSON(w, 200, map[string]any{
			"line":    "2 beds   need water",
			"url":     "/today",
			"metrics": []map[string]any{{"label": "Beds", "value": "3"}, {"label": "Watered", "value": "1 of 3"}},
			"items": []map[string]any{
				{"id": "7", "title": "Tomatoes", "detail": "water today", "url": "/bed/7"},
				{"id": "b-2", "title": "Basil", "done": true, "url": "https://elsewhere.example/steal"},
				{"id": "9", "title": "   "},
			},
			"secret": "must not be passed on",
		})
	})
	var plainCalls atomic.Int32
	f.add(t, "plain", map[string]any{"category": "Tools"}, func(w http.ResponseWriter, r *http.Request) { plainCalls.Add(1) })

	code, out := get(t, f.hub, "/api/v1/daily?date=2026-10-21", "", f.ann)
	if code != 200 {
		t.Fatal(code, out)
	}
	if n := len(out["sources"].([]any)); n != 5 {
		t.Fatalf("want the four first-party sources and the garden, got %d: %v", n, out["sources"])
	}
	src := sourceOf(out, "garden-6")
	if src == nil {
		t.Fatal("the garden is not a source", out["sources"])
	}
	if src["kind"] != "garden" || src["name"] != "Pocket garden" || src["title"] != "Garden today" || src["what"] != "What needs water and what is ready to pick" || src["icon"] != garden.URL+"/favicon.svg" {
		t.Error("the app's own words are missing", src)
	}
	if _, offList := src["app_url"]; offList {
		t.Error("an app on the person's list needs no address of its own", src)
	}
	if src["state"] != "ready" || src["line"] != "2 beds need water" || src["url"] != garden.URL+"/today" {
		t.Error("line or address lost", src)
	}
	// Every metric as the app worded it; the whole numbers also in the old shape.
	if got := fmt.Sprint(src["figures"]); got != "[map[label:Beds value:3] map[label:Watered value:1 of 3]]" {
		t.Error("figures", got)
	}
	if got := fmt.Sprint(src["metrics"]); got != "[map[label:Beds value:3]]" {
		t.Error("metrics", got)
	}
	items := src["items"].([]any)
	if len(items) != 2 {
		t.Fatal("a row without a title must be dropped", items)
	}
	first, second := items[0].(map[string]any), items[1].(map[string]any)
	if first["id"] != float64(7) || first["ref"] != "7" || first["title"] != "Tomatoes" || first["detail"] != "water today" || first["url"] != garden.URL+"/bed/7" {
		t.Error("first row", first)
	}
	if second["id"] != float64(-2) || second["ref"] != "b-2" || second["done"] != true {
		t.Error("second row", second)
	}
	if _, has := second["url"]; has {
		t.Error("a row may only open its own app", second)
	}
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "must not be passed on") {
		t.Fatal("extra fields of the app leaked")
	}
	if sourceOf(out, "plain-7") != nil || plainCalls.Load() != 0 || f.tokens("plain", core.ScopeWidget) != 0 {
		t.Fatal("an app without the capability was shown or called")
	}
	for _, d := range out["destinations"].([]any) {
		if k := d.(map[string]any)["kind"]; k == "garden" || k == "plain" {
			t.Fatal("an app without quick capture is a destination", d)
		}
	}
	// Bob may not use the garden: it is not asked for him and not even mentioned.
	before := f.tokens("garden", core.ScopeWidget)
	_, bob := get(t, f.hub, "/api/v1/daily?date=2026-10-21", "", f.bob)
	raw, _ = json.Marshal(bob)
	if len(bob["sources"].([]any)) != 1 || strings.Contains(string(raw), "garden") || f.tokens("garden", core.ScopeWidget) != before {
		t.Fatal("Bob received an app outside his list", string(raw))
	}
}

// One app failing, or answering something that is not a widget, never fails
// the day and never turns into an empty widget.
func TestDailyWidgetFailuresStayWithTheirApp(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"items": []map[string]any{{"id": "2", "title": "A note"}}})
	})
	f.add(t, "garden", gardenWidget, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 500, map[string]any{"error": "private backend detail"})
	})
	f.add(t, "shed", map[string]any{"widget": map[string]any{"title": "Shed"}}, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("<html>not a widget</html>"))
	})
	code, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	if code != 200 {
		t.Fatal(code, out)
	}
	for _, key := range []string{"garden-6", "shed-7"} {
		src := sourceOf(out, key)
		if src == nil || src["state"] != "unavailable" || src["line"] != nil || len(src["items"].([]any)) != 0 {
			t.Error("a failed widget must read as unavailable", key, src)
		}
	}
	if raw, _ := json.Marshal(out); strings.Contains(string(raw), "private backend") {
		t.Error("an app's error text was passed on")
	}
	if src := sourceOf(out, "notes-4"); src == nil || src["state"] != "ready" {
		t.Error("another app's failure reached Notes", src)
	}
}

// A link that is off for the person is not asked: no token, no call. The app
// is still listed with the reason, so an empty widget explains itself. Quick
// capture leaves it out.
func TestLinkOffIsNotAskedAndSaysWhy(t *testing.T) {
	var calls atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 503, map[string]any{}) })
	manifest := map[string]any{"widget": map[string]any{"title": "Garden today"}, "capture": map[string]any{"kinds": []map[string]any{{"kind": "sowing", "label": "Sowing"}}}}
	f.add(t, "garden", manifest, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		writeJSON(w, 200, map[string]any{"line": "2 beds need water", "items": []any{}})
	})
	f.setLink("garden", core.ScopeWidget, "off_person")
	f.setLink("garden", core.ScopeCapture, "off_admin")
	_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	if sourceOf(out, "garden-6") != nil {
		t.Fatal("an app whose link is off was a source", out["sources"])
	}
	offer := offerOf(out, "garden-6")
	if offer == nil || offer["title"] != "Garden today" || !strings.Contains(fmt.Sprint(offer["off"]), "You switched this off in Pocket Core") {
		t.Fatal("the app is not listed with the reason", out["more"])
	}
	for _, d := range out["destinations"].([]any) {
		if d.(map[string]any)["kind"] == "garden" {
			t.Fatal("a destination whose link is off was offered", d)
		}
	}
	code, refused := f.post(t, f.ann, `{"request_id":"capture-request-0101","app_key":"garden-6","kind":"sowing","text":"Carrots"}`)
	if code != 403 || !strings.Contains(fmt.Sprint(refused["error"]), "Not allowed in Pocket Core yet") {
		t.Fatal("capture through a link that is off", code, refused)
	}
	if calls.Load() != 0 || f.tokens("garden", core.ScopeWidget) != 0 || f.tokens("garden", core.ScopeCapture) != 0 {
		t.Fatal("an app whose link is off was asked")
	}
	// Switched on: the next refresh reads it.
	f.setLink("garden", core.ScopeWidget, "on")
	_, out = get(t, f.hub, "/api/v1/daily", "", f.ann)
	if src := sourceOf(out, "garden-6"); src == nil || src["line"] != "2 beds need water" || offerOf(out, "garden-6") != nil {
		t.Fatal("a link switched on is not read", out)
	}
	// Switched off while Hub still remembers it as on: Core refuses the token,
	// the app is not called, and the person reads why.
	f.mu.Lock()
	f.links["garden "+core.ScopeWidget] = "off_admin"
	f.mu.Unlock()
	before := calls.Load()
	_, out = get(t, f.hub, "/api/v1/daily", "", f.ann)
	src := sourceOf(out, "garden-6")
	if src == nil || src["state"] != "unavailable" || !strings.Contains(fmt.Sprint(src["message"]), "Not allowed in Pocket Core yet") || calls.Load() != before {
		t.Fatal("a link Core has just switched off", src)
	}
	// And Hub has dropped what it remembered: the next refresh lists it as off.
	_, out = get(t, f.hub, "/api/v1/daily", "", f.ann)
	if sourceOf(out, "garden-6") != nil || offerOf(out, "garden-6") == nil {
		t.Fatal("Hub kept asking a link that is off", out)
	}
}

// The person's own token goes only to Kitchen and Day, and only at the address
// Core has for them. When that address check fails the token stays home; apps
// reached through a link are not affected (Core names their address with the
// token), Tasks, Habits and Notes included.
func TestThePersonsTokenStaysWithTheFirstPartyApps(t *testing.T) {
	var own, linked atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer pcu_") {
			own.Add(1)
		}
		writeJSON(w, 200, map[string]any{"line": "2 due today", "items": []any{}})
	})
	manifest := map[string]any{"widget": map[string]any{"title": "Garden today"}, "capture": map[string]any{"kinds": []map[string]any{{"kind": "sowing", "label": "Sowing"}}}}
	f.add(t, "garden", manifest, func(w http.ResponseWriter, r *http.Request) {
		linked.Add(1)
		writeJSON(w, 200, map[string]any{"line": "2 beds need water", "items": []any{}})
	})
	f.mismatch.Store(true)
	_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	keys := []string{}
	for _, raw := range out["sources"].([]any) {
		keys = append(keys, fmt.Sprint(raw.(map[string]any)["app_key"]))
	}
	// Everything that offers a widget through its link; Kitchen's adapter is not used here.
	if got := strings.Join(keys, " "); got != "tasks-1 habits-2 notes-4 garden-6" {
		t.Fatal("sources", got)
	}
	words := []string{}
	for _, d := range out["destinations"].([]any) {
		words = append(words, fmt.Sprint(d.(map[string]any)["capture_kind"]))
	}
	if got := strings.Join(words, " "); got != "task journal note sowing" {
		t.Fatal("a hand-written destination at an unregistered address was offered:", got)
	}
	if code, _ := f.post(t, f.ann, `{"request_id":"capture-request-0102","app_key":"day-5","kind":"moment","text":"No"}`); code != 403 {
		t.Fatal("capture with the person's token to an unregistered address accepted", code)
	}
	if own.Load() != 0 {
		t.Fatal("the person's token left for an unregistered address")
	}
	if linked.Load() != 1 {
		t.Fatal("the linked app was not read", linked.Load())
	}
}

// Tasks, Habits and Notes are read only through their Core links. Their old
// routes are never called, not with the link off (the widget says why, as for
// any app) and not when an older version answers 404 on the widget route.
func TestFirstPartyAppsOnlyThroughTheirLinks(t *testing.T) {
	var contract atomic.Int32
	missing := atomic.Bool{}
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/pocket/widget":
			if r.Header.Get("Authorization") != "Bearer pcx_ann_tasks" {
				writeJSON(w, 503, map[string]any{})
				return
			}
			contract.Add(1)
			if missing.Load() {
				writeJSON(w, 404, map[string]any{"error": "not found"})
				return
			}
			writeJSON(w, 200, map[string]any{"line": "2 due today, 1 late", "metrics": []map[string]any{{"label": "Today", "value": "2"}}, "items": []map[string]any{{"id": "7", "title": "Call the plumber", "url": "/task/7"}}})
		case "/api/v1/plan":
			writeJSON(w, 503, map[string]any{})
		default:
			t.Error("an old route was called", r.URL.Path, r.Header.Get("Authorization"))
		}
	})
	_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	src := sourceOf(out, "tasks-1")
	if src == nil || src["state"] != "ready" || src["title"] != "Tasks today" || src["line"] != "2 due today, 1 late" || len(src["items"].([]any)) != 1 {
		t.Fatal("Tasks was not read through its link", src)
	}
	if got := fmt.Sprint(src["metrics"]); got != "[map[label:Today value:2]]" {
		t.Error("metrics", got)
	}
	// An older Tasks without the route: unavailable, and nothing else is tried.
	missing.Store(true)
	_, out = get(t, f.hub, "/api/v1/daily", "", f.ann)
	if src = sourceOf(out, "tasks-1"); src == nil || src["state"] != "unavailable" || contract.Load() != 2 {
		t.Fatal("a Tasks without the widget route", src)
	}
	// The link off: not asked, listed with the reason, still in its old place.
	f.setLink("tasks", core.ScopeWidget, "off_person")
	_, out = get(t, f.hub, "/api/v1/daily", "", f.ann)
	if sourceOf(out, "tasks-1") != nil || contract.Load() != 2 {
		t.Fatal("Tasks with its link off was asked", out["sources"])
	}
	if offer := offerOf(out, "tasks-1"); offer == nil || offer["title"] != "Tasks today" || !strings.Contains(fmt.Sprint(offer["off"]), "You switched this off in Pocket Core") {
		t.Fatal("Tasks with its link off does not say why", out["more"])
	}
	if first := out["sources"].([]any)[0].(map[string]any); first["app_key"] != "habits-2" {
		t.Error("the apps Hub has always shown no longer come first", first["app_key"])
	}
}

// Kitchen offers no widget, so its adapter reads the day's meal plan with the
// person's own token. The day it offers one, the link takes over for good.
func TestKitchenKeepsItsAdapterUntilItOffersAWidget(t *testing.T) {
	var contract, old atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/plan":
			old.Add(1)
			if r.Header.Get("Authorization") != "Bearer pcu_ann" || r.URL.Query().Get("from") != "2026-10-21" || r.URL.Query().Get("to") != "2026-10-21" {
				t.Error("the Kitchen adapter", r.Header.Get("Authorization"), r.URL.RawQuery)
			}
			writeJSON(w, 200, map[string]any{"entries": []map[string]any{{"id": 3, "recipe_title": "Soup", "slot": "dinner"}, {"id": 4, "title": "Toast", "slot": "breakfast", "cooked_at": "2026-10-21T08:00:00Z"}}})
		case r.URL.Path == "/api/v1/pocket/widget" && r.Header.Get("Authorization") == "Bearer pcx_ann_kitchen":
			contract.Add(1)
			writeJSON(w, 200, map[string]any{"line": "Soup tonight", "items": []any{}})
		default:
			writeJSON(w, 503, map[string]any{})
		}
	})
	_, out := get(t, f.hub, "/api/v1/daily?date=2026-10-21", "", f.ann)
	src := sourceOf(out, "kitchen-3")
	if src == nil || src["state"] != "ready" || fmt.Sprint(src["metrics"]) != "[map[label:Planned meals value:2]]" || fmt.Sprint(src["figures"]) != "[map[label:Planned meals value:2]]" {
		t.Fatal("Kitchen's meal plan", src)
	}
	items := src["items"].([]any)
	if len(items) != 2 || items[0].(map[string]any)["title"] != "Soup" || items[1].(map[string]any)["done"] != true {
		t.Fatal("Kitchen's meals", items)
	}
	f.declare("kitchen", map[string]any{"widget": map[string]any{"title": "Kitchen today"}})
	f.s.forgetCapable("ann@example.com")
	_, out = get(t, f.hub, "/api/v1/daily?date=2026-10-21", "", f.ann)
	if src = sourceOf(out, "kitchen-3"); src == nil || src["line"] != "Soup tonight" || contract.Load() != 1 || old.Load() != 1 {
		t.Fatal("Kitchen with a widget of its own", src, contract.Load(), old.Load())
	}
	f.setLink("kitchen", core.ScopeWidget, "off_admin")
	_, out = get(t, f.hub, "/api/v1/daily?date=2026-10-21", "", f.ann)
	if sourceOf(out, "kitchen-3") != nil || offerOf(out, "kitchen-3") == nil || old.Load() != 1 {
		t.Fatal("Kitchen with its link off went back to the adapter", out["sources"])
	}
}

// An app that is linked for the person but not on their launcher list still
// works; it carries its own address, since no launcher entry opens it.
func TestLinkedAppOutsideTheLauncherList(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 503, map[string]any{}) })
	f.unlisted["shed"] = true
	shed := f.add(t, "shed", map[string]any{"widget": map[string]any{"title": "Shed"}, "capture": map[string]any{"kinds": []map[string]any{{"kind": "tool", "label": "Tool"}}}}, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			writeJSON(w, 201, map[string]any{"id": "3", "url": "/tool/3"})
			return
		}
		writeJSON(w, 200, map[string]any{"line": "1 tool lent out", "items": []any{}})
	})
	_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	src := sourceOf(out, "shed")
	if src == nil || src["state"] != "ready" || src["line"] != "1 tool lent out" || src["app_url"] != shed.URL || src["name"] != "Pocket shed" || src["icon"] != shed.URL+"/favicon.svg" {
		t.Fatal("an app outside the launcher list", out["sources"])
	}
	if _, has := src["url"]; has {
		t.Error("the app's front door is not a place of its own", src)
	}
	code, saved := f.post(t, f.ann, `{"request_id":"capture-request-0103","app_key":"shed","kind":"tool","text":"Spade"}`)
	if code != 201 || saved["id"] != float64(3) || saved["url"] != shed.URL+"/tool/3" {
		t.Fatal(code, saved)
	}
}

// Hub asks Core who offers what once in a while, not on every refresh, and
// asks for a fresh token every time.
func TestWhoOffersIsRememberedBriefly(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 503, map[string]any{}) })
	f.add(t, "garden", gardenWidget, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]any{"items": []any{}}) })
	for i := 0; i < 3; i++ {
		get(t, f.hub, "/api/v1/daily", "", f.ann)
	}
	if n := f.statuses.Load(); n != 2 {
		t.Fatalf("Core was asked who offers a capability %d times for three refreshes, want once per scope", n)
	}
	if n := f.tokens("garden", core.ScopeWidget); n != 3 {
		t.Fatalf("%d link tokens for three refreshes", n)
	}
	get(t, f.hub, "/api/v1/daily", "", f.bob)
	if n := f.statuses.Load(); n != 4 {
		t.Fatal("what Hub remembers is per person", n)
	}
}

// Hub asks for the two capabilities in every app with one rule each, next to
// the activity links it already declared.
func TestManifestAsksForEveryApp(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {})
	f.s.uses = []core.Use{{App: "habits", Scopes: []string{"events:read"}, Reason: "x"}}
	got := []string{}
	for _, u := range f.s.manifest().Uses {
		if u.Reason == "" {
			t.Error("a use without a reason", u)
		}
		got = append(got, u.App+" "+strings.Join(u.Scopes, ","))
	}
	if want := "* pocket:widget|* pocket:capture|habits events:read"; strings.Join(got, "|") != want {
		t.Fatalf("uses %q, want %q", strings.Join(got, "|"), want)
	}
}

// One request asks a bounded number of apps: the ones on the person's Home
// first, then the ones Hub has always shown (however it reaches them), then
// the rest by name.
func TestDailyAsksABoundedNumberOfApps(t *testing.T) {
	on := linkStand{on: true, state: "on"}
	apps := []personalApp{{Key: "tasks-1", Kind: "tasks", widget: &core.Widget{Title: "Tasks today"}, widgetLink: on}, {Key: "kitchen-2", Kind: "kitchen", URL: "https://kitchen.example"},
		{Key: "notes-3", Kind: "notes", widget: &core.Widget{Title: "Recent notes"}, widgetLink: on}, {Key: "day-4", Kind: "day", URL: "https://day.example"}, {Key: "plain-5", Kind: "plain"},
		{Key: "off-6", Kind: "off", widget: &core.Widget{Title: "Off"}, widgetLink: linkStand{state: "off_admin"}}}
	for i := 0; i < 30; i++ {
		apps = append(apps, personalApp{Key: fmt.Sprintf("app%02d-%d", i, 10+i), Kind: fmt.Sprintf("app%02d", i), widget: &core.Widget{Title: "A widget"}, widgetLink: linkStand{on: true, state: "on"}})
	}
	ask, rest := pickSources(apps, map[string]bool{"app29-39": true, "gone-1": true, "off-6": true})
	if len(ask) != maxDailySources || len(rest) != 33-maxDailySources {
		t.Fatalf("asked %d, left %d", len(ask), len(rest))
	}
	keys := []string{}
	for _, a := range ask {
		keys = append(keys, a.Key)
	}
	got := strings.Join(keys, " ")
	if !strings.HasPrefix(got, "tasks-1 kitchen-2 notes-3 app00-10 ") || !strings.HasSuffix(got, " app19-29 app29-39") {
		t.Error("order or choice of the asked apps", got)
	}
	if rest[0].Key != "app20-30" {
		t.Error("the apps left out", rest[0].Key)
	}
}

var gardenCapture = map[string]any{"capture": map[string]any{"kinds": []map[string]any{
	{"kind": "sowing", "label": "Sowing", "what": "A new row in your sowing diary", "fields": []string{"title", "date", "colour"}},
	{"kind": "bad kind"},
}}}

// A quick line for an app Hub has never heard of goes to the app's capture
// route with a link token and the same request id; the receipt carries the
// new item's id and address, and a replay answers from Hub's own record.
func TestCaptureGoesToAnyAppThatOffersIt(t *testing.T) {
	var writes atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("a first-party app received the capture", r.URL.Path)
		}
	})
	garden := f.add(t, "garden", gardenCapture, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/v1/pocket/capture" {
			t.Error("unexpected call to the garden app", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer pcx_ann_garden" || r.Header.Get("Content-Type") != "application/json" {
			t.Error("capture not sent with Ann's link token for the garden", r.Header.Get("Authorization"))
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		want := map[string]any{"request_id": "capture-request-0201", "kind": "sowing", "title": "Carrots", "text": "Second bed", "date": "2026-10-21"}
		if fmt.Sprint(body) != fmt.Sprint(want) {
			t.Errorf("capture body: %v, want %v", body, want)
		}
		writes.Add(1)
		writeJSON(w, 201, map[string]any{"id": "s-44", "title": "Carrots", "url": "/sowing/s-44"})
	})
	_, daily := get(t, f.hub, "/api/v1/daily", "", f.ann)
	var dest map[string]any
	words := []string{}
	for _, raw := range daily["destinations"].([]any) {
		d := raw.(map[string]any)
		words = append(words, fmt.Sprint(d["kind"], ":", d["capture_kind"]))
		if d["app_key"] == "garden-6" {
			dest = d
		}
	}
	if got := strings.Join(words, " "); got != "tasks:task habits:journal notes:note day:moment garden:sowing" {
		t.Fatal("destinations", got)
	}
	if dest["label"] != "Sowing" || dest["what"] != "A new row in your sowing diary" || fmt.Sprint(dest["fields"]) != "[title date]" {
		t.Error("the kind's own words are missing", dest)
	}
	// "due" is not a field of this kind, so it stays in Hub.
	body := `{"request_id":"capture-request-0201","app_key":"garden-6","kind":"sowing","title":"Carrots","text":"Second bed","due":"2026-10-30","date":"2026-10-21"}`
	for i := 0; i < 2; i++ {
		code, out := f.post(t, f.ann, body)
		if code != 201 || out["status"] != "saved" || out["kind"] != "sowing" || out["item_id"] != "s-44" || out["id"] != float64(0) || out["title"] != "Carrots" || out["url"] != garden.URL+"/sowing/s-44" {
			t.Fatal(code, out)
		}
	}
	if writes.Load() != 1 || f.tokens("garden", core.ScopeCapture) != 1 {
		t.Fatal("a replay reached the app or Core again")
	}
	for _, kind := range []string{"harvest", "bad kind", "task"} {
		code, out := f.post(t, f.ann, strings.NewReplacer("0201", "0202", `"sowing"`, `"`+kind+`"`).Replace(body))
		if code != 400 || out["error"] == "" {
			t.Fatal("a kind the app does not offer was accepted", kind, code, out)
		}
	}
	if code, _ := f.post(t, f.bob, strings.Replace(body, "0201", "0203", 1)); code != 403 {
		t.Fatal("Bob captured into an app outside his list", code)
	}
	if code, out := f.post(t, f.ann, `{"request_id":"capture-request-0204","app_key":"garden-6","kind":"sowing","due":"2026-10-30"}`); code != 400 || out["error"] != "Write something first." {
		t.Fatal("an empty line was sent on", code, out)
	}
	if writes.Load() != 1 || f.tokens("garden", core.ScopeCapture) != 1 {
		t.Fatal("a refused capture reached the app")
	}
}

// What the app says a person can fix (400) reaches the person word for word,
// and is not sent a second time for the same request.
func TestCaptureRefusalIsToldInTheAppsWords(t *testing.T) {
	var writes atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {})
	f.add(t, "garden", gardenCapture, func(w http.ResponseWriter, r *http.Request) {
		writes.Add(1)
		writeJSON(w, 400, map[string]any{"error": "the sowing diary is full for this year"})
	})
	body := `{"request_id":"capture-request-0301","app_key":"garden-6","kind":"sowing","text":"Carrots"}`
	for i := 0; i < 2; i++ {
		code, out := f.post(t, f.ann, body)
		if code != 400 || out["status"] != "failed" || out["error"] != "the sowing diary is full for this year" {
			t.Fatal(code, out)
		}
	}
	if writes.Load() != 1 {
		t.Fatal("a refused capture was sent twice")
	}
}

// An answer without an id is never reported as saved, and a link Core has
// just switched off sends nothing.
func TestCaptureThroughALinkNeedsAReceiptAndTheLink(t *testing.T) {
	var writes atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {})
	f.add(t, "garden", gardenCapture, func(w http.ResponseWriter, r *http.Request) {
		writes.Add(1)
		writeJSON(w, 201, map[string]any{"title": "Carrots"})
	})
	code, out := f.post(t, f.ann, `{"request_id":"capture-request-0401","app_key":"garden-6","kind":"sowing","text":"Carrots"}`)
	if code != 502 || out["status"] != "unknown" {
		t.Fatal("a capture without a receipt was reported as saved", code, out)
	}
	// Hub still remembers the link as on; Core refuses the token.
	f.mu.Lock()
	f.links["garden "+core.ScopeCapture] = "off_person"
	f.mu.Unlock()
	code, out = f.post(t, f.ann, `{"request_id":"capture-request-0402","app_key":"garden-6","kind":"sowing","text":"Carrots"}`)
	if code != 502 || out["status"] != "failed" || !strings.Contains(fmt.Sprint(out["error"]), "You switched this off in Pocket Core") {
		t.Fatal("a capture through a link that was just switched off", code, out)
	}
	if writes.Load() != 1 {
		t.Fatal("a capture reached the app without a link")
	}
}

// Tasks, Habits and Notes get a quick line only through their links: with the
// link off nothing is sent, and an older version that answers 404 is not
// tried another way. A field the person left empty is not sent, so the app
// decides (a journal line without a day goes to the app's own today).
func TestFirstPartyCaptureOnlyThroughTheLink(t *testing.T) {
	var contract atomic.Int32
	missing := atomic.Bool{}
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/pocket/capture" {
			t.Error("an old route was called", r.URL.Path)
			return
		}
		contract.Add(1)
		if missing.Load() {
			writeJSON(w, 404, map[string]any{"error": "not found"})
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		switch r.Header.Get("Authorization") {
		case "Bearer pcx_ann_notes":
			if body["kind"] != "note" || body["title"] != "An idea" || body["text"] != "For later" {
				t.Error("note body", body)
			}
			writeJSON(w, 201, map[string]any{"id": "12", "title": "An idea", "url": "/note/12"})
		case "Bearer pcx_ann_habits":
			if _, dated := body["date"]; dated || body["kind"] != "journal" || body["text"] != "Slept well" {
				t.Error("journal body", body)
			}
			writeJSON(w, 201, map[string]any{"id": "2026-11-27", "url": "/journal/2026-11-27"})
		default:
			t.Error("capture not sent with a link token", r.Header.Get("Authorization"))
		}
	})
	body := `{"request_id":"capture-request-0501","app_key":"notes-4","kind":"note","title":"An idea","text":"For later"}`
	code, out := f.post(t, f.ann, body)
	if code != 201 || out["id"] != float64(12) || out["item_id"] != "12" || !strings.HasSuffix(fmt.Sprint(out["url"]), "/note/12") {
		t.Fatal(code, out)
	}
	if code, out = f.post(t, f.ann, `{"request_id":"capture-request-0504","app_key":"habits-2","kind":"journal","text":"Slept well"}`); code != 201 || out["item_id"] != "2026-11-27" {
		t.Fatal("journal line", code, out)
	}
	// An older Notes: the route is not there, nothing was kept, and the person is told.
	missing.Store(true)
	code, out = f.post(t, f.ann, strings.Replace(body, "0501", "0502", 1))
	if code != 502 || out["status"] != "failed" || contract.Load() != 3 {
		t.Fatal("a Notes without the capture route", code, out, contract.Load())
	}
	// The link switched off: refused with the reason, nothing sent.
	f.setLink("notes", core.ScopeCapture, "off_admin")
	code, out = f.post(t, f.ann, strings.Replace(body, "0501", "0503", 1))
	if code != 403 || !strings.Contains(fmt.Sprint(out["error"]), "Not allowed in Pocket Core yet") || contract.Load() != 3 {
		t.Fatal("link off", code, out, contract.Load())
	}
}

// Day offers no quick capture, so a journal moment goes to its own route with
// the person's own token, with the day the person picked or none at all.
func TestJournalMomentGoesToDay(t *testing.T) {
	var bodies []map[string]any
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			writeJSON(w, 503, map[string]any{}) // the day's widgets
			return
		}
		if r.URL.Path != "/api/v1/moments" || r.Header.Get("Authorization") != "Bearer pcu_ann" || r.Header.Get("X-Pocket-Source") != "hub" {
			t.Error("the moment did not reach Day as the person", r.Method, r.URL.Path, r.Header.Get("Authorization"))
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		bodies = append(bodies, body)
		writeJSON(w, 201, map[string]any{"id": len(bodies)})
	})
	_, daily := get(t, f.hub, "/api/v1/daily", "", f.ann)
	found := false
	for _, raw := range daily["destinations"].([]any) {
		if d := raw.(map[string]any); d["app_key"] == "day-5" {
			found = d["capture_kind"] == "moment" && d["label"] == "Journal moment" && fmt.Sprint(d["fields"]) == "[date]"
		}
	}
	if !found {
		t.Fatal("no journal moment", daily["destinations"])
	}
	code, out := f.post(t, f.ann, `{"request_id":"capture-request-0601","app_key":"day-5","kind":"moment","text":"Sea","date":"2026-11-20"}`)
	if code != 201 || out["id"] != float64(1) {
		t.Fatal(code, out)
	}
	if code, out = f.post(t, f.ann, `{"request_id":"capture-request-0602","app_key":"day-5","kind":"moment","text":"Rain"}`); code != 201 {
		t.Fatal(code, out)
	}
	if code, out = f.post(t, f.ann, `{"request_id":"capture-request-0603","app_key":"day-5","kind":"moment","title":"Only a title"}`); code != 400 || out["error"] != "Write a moment to keep." {
		t.Fatal("an empty moment", code, out)
	}
	if code, out = f.post(t, f.ann, `{"request_id":"capture-request-0604","app_key":"day-5","kind":"task","title":"Not a moment"}`); code != 400 {
		t.Fatal("Day was given a task", code, out)
	}
	if got := fmt.Sprint(bodies); got != "[map[date:2026-11-20 kind:note text:Sea] map[kind:note text:Rain]]" {
		t.Fatal("moments", got)
	}
}

// The launcher passes on the shelf an app named for itself.
func TestLauncherCarriesTheAppsCategory(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {})
	f.declare("habits", map[string]any{"category": " Everyday "})
	_, out := get(t, f.hub, "/api/v1/launcher", "", f.ann)
	found := false
	for _, raw := range out["apps"].([]any) {
		tile := raw.(map[string]any)
		switch tile["type"] {
		case "habits":
			found = tile["category"] == "Everyday"
		case "notes":
			if _, has := tile["category"]; has {
				t.Error("a category appeared for an app that named none", tile)
			}
		}
	}
	if !found {
		t.Fatal("the app's category did not reach the launcher", out["apps"])
	}
}

func TestAppLinksStayInsideTheApp(t *testing.T) {
	app := "https://box.example/garden"
	for raw, want := range map[string]string{
		"/bed/7":                                "https://box.example/garden/bed/7",
		"bed/7?tab=water":                       "https://box.example/garden/bed/7?tab=water",
		"https://box.example/garden/bed/7":      "https://box.example/garden/bed/7",
		"https://box.example/garden":            "https://box.example/garden",
		"https://box.example/notes/1":           "",
		"https://box.example.evil.example/x":    "",
		"http://box.example/garden/bed/7":       "",
		"//evil.example/x":                      "",
		"javascript:alert(1)":                   "",
		"https://user:pw@box.example/garden/x":  "",
		"":                                      "",
		"https://box.example/garden\n/bed":      "",
		"https://box.example/gardening/secrets": "",
	} {
		if got := appLink(app, raw); got != want {
			t.Errorf("appLink(%q) = %q, want %q", raw, got, want)
		}
	}
	if appLink("", "/bed/7") != "" {
		t.Error("an app without an address has no links")
	}
}
