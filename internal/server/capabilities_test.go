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

var gardenWidget = map[string]any{"category": "Home", "widget": map[string]any{"title": "Garden today", "what": "What needs water and what is ready to pick"}}

// An app Hub has never heard of shows up on its own once its manifest says
// "widget": it is asked on the contract route as the person, and its answer is
// put in the shape /daily has always had. An app that says nothing is left alone.
func TestDailyShowsAnyAppThatDeclaresAWidget(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 503, map[string]any{}) })
	garden := f.add(t, "garden", gardenWidget, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.URL.Path != "/api/v1/pocket/widget" {
			t.Error("unexpected call to the garden app", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer pcu_ann" || r.Header.Get("X-Pocket-Source") != "hub" {
			t.Error("widget not read as the person", r.Header.Get("Authorization"))
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
	if sourceOf(out, "plain-7") != nil || plainCalls.Load() != 0 {
		t.Fatal("an app without the capability was shown or called")
	}
	for _, d := range out["destinations"].([]any) {
		if k := d.(map[string]any)["kind"]; k == "garden" || k == "plain" {
			t.Fatal("an app without quick capture is a destination", d)
		}
	}
	// Bob does not have the garden: nothing about it reaches him.
	_, bob := get(t, f.hub, "/api/v1/daily?date=2026-10-21", "", f.bob)
	if sourceOf(bob, "garden-6") != nil || len(bob["sources"].([]any)) != 1 {
		t.Fatal("Bob received an app outside his list", bob["sources"])
	}
}

// One app failing, or answering something that is not a widget, never fails
// the day and never turns into an empty widget.
func TestDailyWidgetFailuresStayWithTheirApp(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, []map[string]any{{"id": 2, "title": "A note"}})
	})
	f.add(t, "garden", gardenWidget, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 404, map[string]any{"error": "not found"}) })
	f.add(t, "shed", map[string]any{"widget": map[string]any{"title": "Shed"}}, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"line": "no items key"})
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
	if src := sourceOf(out, "notes-4"); src == nil || src["state"] != "ready" {
		t.Error("another app's failure reached Notes", src)
	}
}

// The person's token only goes to the address Core has for the app, whatever
// the app declares.
func TestDeclaredAppsKeepTheAddressCheck(t *testing.T) {
	var calls atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1) })
	manifest := map[string]any{"widget": map[string]any{"title": "Garden today"}, "capture": map[string]any{"kinds": []map[string]any{{"kind": "sowing", "label": "Sowing"}}}}
	f.add(t, "garden", manifest, func(w http.ResponseWriter, r *http.Request) { calls.Add(1) })
	f.mismatch.Store(true)
	_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	if len(out["sources"].([]any)) != 0 || len(out["destinations"].([]any)) != 0 || len(out["more"].([]any)) != 0 {
		t.Fatal("an app at another address than the registry's was offered", out)
	}
	if code, _ := f.post(t, f.ann, `{"request_id":"capture-request-0101","app_key":"garden-6","kind":"sowing","text":"Carrots"}`); code != 403 {
		t.Fatal("capture to an unregistered address accepted", code)
	}
	if calls.Load() != 0 {
		t.Fatal("the person's token left for an unregistered address")
	}
}

// Tasks, Habits, Kitchen and Notes are read through the contract once they
// declare a widget; the hand-written adapter is not used for them any more.
func TestFirstPartyAppWithAWidgetUsesTheContract(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/pocket/widget":
			writeJSON(w, 200, map[string]any{"line": "2 due today, 1 late", "metrics": []map[string]any{{"label": "Today", "value": "2"}}, "items": []map[string]any{{"id": "7", "title": "Call the plumber", "url": "/task/7"}}})
		case "/api/v1/dashboard":
			t.Error("the hand-written Tasks adapter was used next to the contract")
		default:
			writeJSON(w, 503, map[string]any{})
		}
	})
	f.declare("tasks", map[string]any{"widget": map[string]any{"title": "Tasks today"}})
	_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	src := sourceOf(out, "tasks-1")
	if src == nil || src["state"] != "ready" || src["title"] != "Tasks today" || src["line"] != "2 due today, 1 late" || len(src["items"].([]any)) != 1 {
		t.Fatal("Tasks was not read through the contract", src)
	}
	if got := fmt.Sprint(src["metrics"]); got != "[map[label:Today value:2]]" {
		t.Error("metrics", got)
	}
}

// An older Tasks whose manifest already says "widget" answers 404 on the
// route: Hub reads it the old way, and does not ask the route again for a while.
func TestFirstPartyAppWithoutTheRouteFallsBack(t *testing.T) {
	var contract, old atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/pocket/widget":
			contract.Add(1)
			writeJSON(w, 404, map[string]any{"error": "not found"})
		case "/api/v1/dashboard":
			old.Add(1)
			writeJSON(w, 200, map[string]any{"today": 2, "overdue": 1, "done_today": 3, "next": []map[string]any{{"id": 1, "title": "Old style task"}}})
		default:
			writeJSON(w, 503, map[string]any{})
		}
	})
	f.declare("tasks", map[string]any{"widget": map[string]any{"title": "Tasks today"}})
	for i := 1; i <= 2; i++ {
		_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
		src := sourceOf(out, "tasks-1")
		if src == nil || src["state"] != "ready" || len(src["items"].([]any)) != 1 || len(src["metrics"].([]any)) != 3 || len(src["figures"].([]any)) != 3 {
			t.Fatal("Tasks did not fall back to its own summary", src)
		}
		if contract.Load() != 1 || old.Load() != int32(i) {
			t.Fatalf("round %d: contract asked %d times, old route %d times", i, contract.Load(), old.Load())
		}
	}
}

// One request asks a bounded number of apps: the ones on the person's Home
// first, then the first-party four, then the rest by name.
func TestDailyAsksABoundedNumberOfApps(t *testing.T) {
	apps := []personalApp{{Key: "tasks-1", Kind: "tasks"}, {Key: "day-2", Kind: "day"}, {Key: "notes-3", Kind: "notes"}, {Key: "plain-4", Kind: "plain"}}
	for i := 0; i < 30; i++ {
		apps = append(apps, personalApp{Key: fmt.Sprintf("app%02d-%d", i, 10+i), Kind: fmt.Sprintf("app%02d", i), widget: &core.Widget{Title: "A widget"}})
	}
	ask, rest := pickSources(apps, map[string]bool{"app29-39": true, "gone-1": true})
	if len(ask) != maxDailySources || len(rest) != 32-maxDailySources {
		t.Fatalf("asked %d, left %d", len(ask), len(rest))
	}
	keys := []string{}
	for _, a := range ask {
		keys = append(keys, a.Key)
	}
	got := strings.Join(keys, " ")
	if !strings.HasPrefix(got, "tasks-1 notes-3 app00-10 ") || !strings.HasSuffix(got, " app20-30 app29-39") {
		t.Error("order or choice of the asked apps", got)
	}
	if rest[0].Key != "app21-31" {
		t.Error("the apps left out", rest[0].Key)
	}
}

var gardenCapture = map[string]any{"capture": map[string]any{"kinds": []map[string]any{
	{"kind": "sowing", "label": "Sowing", "what": "A new row in your sowing diary", "fields": []string{"title", "date", "colour"}},
	{"kind": "bad kind"},
}}}

// A quick line for an app Hub has never heard of goes to the app's capture
// route with the same request id; the receipt carries the new item's id and
// address, and a replay answers from Hub's own record.
func TestCaptureGoesToAnyAppThatDeclaresIt(t *testing.T) {
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
		if r.Header.Get("Authorization") != "Bearer pcu_ann" || r.Header.Get("Content-Type") != "application/json" {
			t.Error("capture not sent as the person")
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
	if got := strings.Join(words, " "); got != "tasks:task notes:note day:moment garden:sowing" {
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
	if writes.Load() != 1 {
		t.Fatal("a replay reached the app again")
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
	if writes.Load() != 1 {
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

// An answer without an id is never reported as saved.
func TestCaptureContractNeedsAReceipt(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {})
	f.add(t, "garden", gardenCapture, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 201, map[string]any{"title": "Carrots"}) })
	code, out := f.post(t, f.ann, `{"request_id":"capture-request-0401","app_key":"garden-6","kind":"sowing","text":"Carrots"}`)
	if code != 502 || out["status"] != "unknown" {
		t.Fatal("a capture without a receipt was reported as saved", code, out)
	}
}

// Notes that declares quick capture gets the line on the contract route. A
// Notes that answers 404 there (an older version) gets it the old way, and the
// contract route is left alone for a while.
func TestFirstPartyCaptureUsesTheContractAndFallsBack(t *testing.T) {
	var contract, old atomic.Int32
	missing := atomic.Bool{}
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/pocket/capture":
			contract.Add(1)
			if missing.Load() {
				writeJSON(w, 404, map[string]any{"error": "not found"})
				return
			}
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["kind"] != "note" || body["title"] != "An idea" || body["text"] != "For later" {
				t.Error("capture body", body)
			}
			writeJSON(w, 201, map[string]any{"id": "12", "title": "An idea", "url": "/note/12"})
		case "/api/v1/notes":
			old.Add(1)
			writeJSON(w, 201, map[string]any{"id": 9})
		default:
			t.Error("unexpected path", r.URL.Path)
		}
	})
	f.declare("notes", map[string]any{"capture": map[string]any{"kinds": []map[string]any{{"kind": "note", "label": "Note", "fields": []string{"title"}}}}})
	body := `{"request_id":"capture-request-0501","app_key":"notes-4","kind":"note","title":"An idea","text":"For later"}`
	code, out := f.post(t, f.ann, body)
	if code != 201 || out["id"] != float64(12) || out["item_id"] != "12" || !strings.HasSuffix(fmt.Sprint(out["url"]), "/note/12") {
		t.Fatal(code, out)
	}
	if contract.Load() != 1 || old.Load() != 0 {
		t.Fatal("the hand-written route was used next to the contract")
	}
	missing.Store(true)
	for i := 2; i <= 3; i++ {
		code, out = f.post(t, f.ann, strings.Replace(body, "0501", fmt.Sprintf("05%02d", i), 1))
		if code != 201 || out["id"] != float64(9) {
			t.Fatal(code, out)
		}
		if contract.Load() != 2 || old.Load() != int32(i-1) {
			t.Fatalf("round %d: contract asked %d times, old route %d times", i, contract.Load(), old.Load())
		}
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
	app := personalApp{URL: "https://box.example/garden"}
	for raw, want := range map[string]string{
		"/bed/7":                                "https://box.example/garden/bed/7",
		"bed/7?tab=water":                       "https://box.example/garden/bed/7?tab=water",
		"https://box.example/garden/bed/7":      "https://box.example/garden/bed/7",
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
}
