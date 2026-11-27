package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/abjelosevic88/pocket-homelab-hub/internal/store"
)

type dailyFixture struct {
	s        *Server
	hub      *httptest.Server
	ann, bob string
	revoked  atomic.Bool
	mismatch atomic.Bool

	mu        sync.Mutex
	appURL    string                    // where the five first-party apps live
	manifests map[string]map[string]any // what a first-party app declares, by slug
	extra     []extraApp                // apps Hub has no adapter for (Ann's only)
	links     map[string]string         // "<slug> <scope>" → a state other than "on"
	unlisted  map[string]bool           // apps linked for Ann that are not on her launcher list
	asked     map[string]int            // link tokens Core was asked for, by "<slug> <scope>"
	statuses  atomic.Int32              // how often Core was asked who offers a capability
}

type extraApp struct {
	slug, url string
	manifest  map[string]any
}

// declare sets the manifest Core has for one of the first-party apps. An app
// that declares "widget" or "capture" offers it through a link, on by default.
func (f *dailyFixture) declare(slug string, manifest map[string]any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.manifests[slug] = manifest
}

// add registers an app Hub has never heard of, on its own address, and puts it
// on Ann's list. Such an app must never see a person's own token.
func (f *dailyFixture) add(t *testing.T, slug string, manifest map[string]any, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if bearer := r.Header.Get("Authorization"); !strings.HasPrefix(bearer, "Bearer pcx_") {
			t.Errorf("%s was called with %q: only a link token may reach an app Hub has no adapter for", slug, bearer)
		}
		handler(w, r)
	}))
	t.Cleanup(app.Close)
	f.mu.Lock()
	defer f.mu.Unlock()
	f.extra = append(f.extra, extraApp{slug: slug, url: app.URL, manifest: manifest})
	return app
}

// setLink changes how a link stands for Ann (off_admin, off_person, on) and
// makes Hub forget what it remembered about her links.
func (f *dailyFixture) setLink(slug, scope, state string) {
	f.mu.Lock()
	f.links[slug+" "+scope] = state
	f.mu.Unlock()
	f.s.forgetCapable("ann@example.com")
}

// tokens is how many link tokens Core was asked for, for one app and scope.
func (f *dailyFixture) tokens(slug, scope string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.asked[slug+" "+scope]
}

// offered lists, under the lock, every app with its address and manifest.
func (f *dailyFixture) offered() []extraApp {
	out := []extraApp{}
	for _, kind := range personalKinds {
		out = append(out, extraApp{slug: kind, url: f.appURL, manifest: f.manifests[kind]})
	}
	return append(out, f.extra...)
}

// linkState is how Hub's link to an app stands for a person, as Core would say.
func (f *dailyFixture) linkState(user string, x extraApp, scope string) string {
	if x.manifest[strings.TrimPrefix(scope, "pocket:")] == nil {
		return "not_offered"
	}
	if user != "ann@example.com" && !(user == "bob@example.com" && x.slug == "notes") {
		return "not_in_audience"
	}
	if state := f.links[x.slug+" "+scope]; state != "" {
		return state
	}
	return "on"
}

func dailySetup(t *testing.T, handler http.HandlerFunc) *dailyFixture {
	t.Helper()
	f := &dailyFixture{manifests: map[string]map[string]any{}, links: map[string]string{}, unlisted: map[string]bool{}, asked: map[string]int{}}
	// The rule every test keeps: the person's own token never reaches a
	// capability route, and a link token never reaches another route.
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bearer, contract := r.Header.Get("Authorization"), strings.HasPrefix(r.URL.Path, "/api/v1/pocket/")
		if contract != strings.HasPrefix(bearer, "Bearer pcx_") {
			t.Errorf("%s was called with %q", r.URL.Path, bearer)
		}
		handler(w, r)
	}))
	f.appURL = app.URL
	t.Cleanup(app.Close)
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/me/services":
			services := []map[string]any{}
			if !f.revoked.Load() {
				for i, kind := range personalKinds {
					if r.Header.Get("Authorization") == "Bearer pcu_bob" && kind != "notes" {
						continue
					}
					target := app.URL
					if f.mismatch.Load() {
						target = "https://unregistered.example"
					}
					services = append(services, map[string]any{"id": i + 1, "type": kind, "name": "Pocket " + kind, "url": target, "pocket": true})
				}
				f.mu.Lock()
				for i, x := range f.extra {
					if r.Header.Get("Authorization") != "Bearer pcu_ann" || f.unlisted[x.slug] {
						continue
					}
					target := x.url
					if f.mismatch.Load() {
						target = "https://unregistered.example"
					}
					services = append(services, map[string]any{"id": len(personalKinds) + i + 1, "type": x.slug, "name": "Pocket " + x.slug, "url": target, "icon": x.url + "/favicon.svg", "pocket": true})
				}
				f.mu.Unlock()
			}
			writeJSON(w, 200, services)
		case "/api/v1/apps":
			if r.Header.Get("Authorization") != "Bearer pca_hub" {
				t.Error("registry not read as hub")
			}
			apps := []map[string]any{}
			f.mu.Lock()
			for i, kind := range personalKinds {
				apps = append(apps, map[string]any{"id": i + 1, "slug": kind, "public_url": app.URL, "manifest": f.manifests[kind]})
			}
			for i, x := range f.extra {
				apps = append(apps, map[string]any{"id": len(personalKinds) + i + 1, "slug": x.slug, "public_url": x.url, "manifest": x.manifest})
			}
			f.mu.Unlock()
			writeJSON(w, 200, apps)
		case "/api/v1/links/status":
			// Who offers a capability to this person, and how each link stands (sdk.Capable).
			f.statuses.Add(1)
			if r.Header.Get("Authorization") != "Bearer pca_hub" {
				t.Error("links not read as hub")
			}
			user, scope := r.URL.Query().Get("user"), r.URL.Query().Get("scope")
			rows := []map[string]any{}
			f.mu.Lock()
			for _, x := range f.offered() {
				state := f.linkState(user, x, scope)
				if state == "not_offered" {
					continue
				}
				target := map[string]any{"name": "Pocket " + x.slug, "icon": x.url + "/favicon.svg", "url": x.url, "public_url": x.url}
				for k, v := range x.manifest {
					target[k] = v
				}
				rows = append(rows, map[string]any{"app": x.slug, "scope": scope, "state": state, "on": state == "on", "detail": state, "target": target})
			}
			f.mu.Unlock()
			writeJSON(w, 200, rows)
		case "/api/v1/links/token":
			// A token that works only in the target app, for the scopes asked (sdk.ActAs).
			if r.Header.Get("Authorization") != "Bearer pca_hub" {
				t.Error("link token not asked as hub")
			}
			var in struct {
				User, App string
				Scopes    []string
			}
			_ = json.NewDecoder(r.Body).Decode(&in)
			f.mu.Lock()
			defer f.mu.Unlock()
			for _, x := range f.offered() {
				if x.slug != in.App || len(in.Scopes) != 1 {
					continue
				}
				f.asked[x.slug+" "+in.Scopes[0]]++
				if state := f.linkState(in.User, x, in.Scopes[0]); state != "on" {
					writeJSON(w, 403, map[string]any{"error": x.slug + " " + in.Scopes[0] + ": " + state, "reason": state, "scope": in.Scopes[0]})
					return
				}
				writeJSON(w, 200, map[string]any{"access_token": "pcx_" + strings.TrimSuffix(in.User, "@example.com") + "_" + x.slug, "expires_in": 300, "scope": in.Scopes[0], "app": x.slug, "url": x.url, "public_url": x.url})
				return
			}
			writeJSON(w, 403, map[string]any{"error": "no such app", "reason": "target_missing"})
		case "/api/v1/auth/subject":
			writeJSON(w, 200, map[string]any{"active": true, "iss": "core"})
		default:
			writeJSON(w, 200, map[string]any{})
		}
	}))
	t.Cleanup(core.Close)
	f.s, f.hub = newHub(t, core.URL)
	for _, name := range []string{"ann", "bob"} {
		user := &store.User{Email: name + "@example.com", Name: name, Role: "member"}
		if err := f.s.store.CreateUser(context.Background(), user); err != nil {
			t.Fatal(err)
		}
		session, err := f.s.store.CreateSession(context.Background(), user.ID, time.Hour)
		if err != nil {
			t.Fatal(err)
		}
		if err := f.s.store.SaveGrant(context.Background(), session, "pcu_"+name, "", time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
		if name == "ann" {
			f.ann = session
		} else {
			f.bob = session
		}
	}
	return f
}
func (f *dailyFixture) post(t *testing.T, cookie, body string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest("POST", f.hub.URL+"/api/v1/capture", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: cookie})
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	return res.StatusCode, out
}
func TestDailyPersonalSourcesAndRevocation(t *testing.T) {
	var calls atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		token := r.Header.Get("Authorization")
		if token != "Bearer pcu_ann" && token != "Bearer pcu_bob" {
			t.Errorf("personal request sent wrong bearer %q", token)
		}
		switch r.URL.Path {
		case "/api/v1/dashboard":
			writeJSON(w, 200, map[string]any{"today": 2, "overdue": 1, "done_today": 3, "next": []map[string]any{{"id": 1, "title": "Ann's task"}}})
		case "/api/v1/days/2026-10-21":
			writeJSON(w, 200, map[string]any{"done": 1, "total": 2, "habits": []map[string]any{{"id": 1, "name": "A walk", "scheduled": true, "status": 1}}, "journal": "Private journal must not be returned"})
		case "/api/v1/plan":
			writeJSON(w, 503, map[string]any{"error": "private backend detail"})
		case "/api/v1/notes":
			writeJSON(w, 200, []map[string]any{{"id": 2, "title": token + " note", "content": "Secret full note content"}})
		default:
			t.Error("unexpected app path", r.URL.Path)
		}
	})
	code, out := get(t, f.hub, "/api/v1/daily?date=2026-10-21", "", f.ann)
	if code != 200 {
		t.Fatal(code, out)
	}
	sources := out["sources"].([]any)
	if len(sources) != 4 {
		t.Fatal(sources)
	}
	if sources[2].(map[string]any)["state"] != "unavailable" {
		t.Fatal("one source failure must stay independent")
	}
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "Secret full") || strings.Contains(string(raw), "Private journal") || strings.Contains(string(raw), "private backend") {
		t.Fatal("summary leaked extra app fields")
	}
	_, bob := get(t, f.hub, "/api/v1/daily?date=2026-10-21", "", f.bob)
	if len(bob["sources"].([]any)) != 1 {
		t.Fatal("Bob received apps outside his audience")
	}
	raw, _ = json.Marshal(bob)
	if strings.Contains(string(raw), "Ann's") || strings.Contains(string(raw), "pcu_ann") {
		t.Fatal("cross-account summary leak")
	}
	f.revoked.Store(true)
	before := calls.Load()
	_, out = get(t, f.hub, "/api/v1/daily", "", f.ann)
	if len(out["sources"].([]any)) != 0 || calls.Load() != before {
		t.Fatal("revoked source was contacted")
	}
	if code, _ = get(t, f.hub, "/api/v1/daily?date=2026-99-42", "", f.ann); code != 400 {
		t.Fatal("invalid date accepted")
	}
	if code, _ = get(t, f.hub, "/api/v1/daily", "", ""); code != 401 {
		t.Fatal("anonymous daily allowed")
	}
}
func TestCaptureDeduplicatesAndRechecksAccess(t *testing.T) {
	var writes atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/v1/tasks" {
			t.Error("unexpected mutation", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer pcu_ann" {
			t.Error("wrong principal")
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["title"] != "Call mum" || body["due"] != "2026-10-22" {
			t.Error("capture fields lost", body)
		}
		writes.Add(1)
		writeJSON(w, 201, map[string]any{"id": 42, "title": "Call mum"})
	})
	body := `{"request_id":"capture-request-0001","app_key":"tasks-1","kind":"task","title":"Call mum","due":"2026-10-22"}`
	for i := 0; i < 2; i++ {
		code, out := f.post(t, f.ann, body)
		if code != 201 || out["id"] != float64(42) {
			t.Fatal(code, out)
		}
	}
	if writes.Load() != 1 {
		t.Fatal("duplicate task created")
	}
	if code, _ := f.post(t, f.ann, strings.Replace(body, "Call mum", "Call dad", 1)); code != 409 {
		t.Fatal("reused key with different content accepted")
	}
	if code, _ := f.post(t, f.bob, body); code != 403 {
		t.Fatal("wrong audience allowed")
	}
	f.revoked.Store(true)
	if code, _ := f.post(t, f.ann, body); code != 403 {
		t.Fatal("receipt returned after destination revoked")
	}
	if writes.Load() != 1 {
		t.Fatal("revoked write was forwarded")
	}
}
func TestCaptureUnknownOutcomeNeverRetriesMutation(t *testing.T) {
	var writes atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { writes.Add(1); w.WriteHeader(500) })
	body := `{"request_id":"capture-request-0002","app_key":"notes-4","kind":"note","text":"An idea"}`
	for i := 0; i < 2; i++ {
		code, out := f.post(t, f.ann, body)
		if code != 502 || out["status"] != "unknown" {
			t.Fatal(code, out)
		}
	}
	if writes.Load() != 1 {
		t.Fatal("uncertain mutation was sent twice")
	}
	// A pending row, as after a crash, is also never forwarded again.
	_, err := f.s.store.DB.Exec("UPDATE capture_requests SET http_status=0,result=''")
	if err != nil {
		t.Fatal(err)
	}
	if code, out := f.post(t, f.ann, body); code != 409 || out["status"] != "unknown" {
		t.Fatal(code, out)
	}
	if writes.Load() != 1 {
		t.Fatal("interrupted capture was resent")
	}
}
func TestPersonalDestinationsMustMatchAndCannotRedirect(t *testing.T) {
	var leaked atomic.Int32
	trap := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked.Add(1) }))
	defer trap.Close()
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, trap.URL, http.StatusTemporaryRedirect)
	})
	_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	for _, v := range out["sources"].([]any) {
		if v.(map[string]any)["state"] != "unavailable" {
			t.Fatal("redirect accepted")
		}
	}
	if leaked.Load() != 0 {
		t.Fatal("token followed a redirect")
	}
	f.mismatch.Store(true)
	_, out = get(t, f.hub, "/api/v1/daily", "", f.ann)
	if len(out["sources"].([]any)) != 0 {
		t.Fatal("unregistered origin accepted")
	}
	if code, _ := f.post(t, f.ann, `{"request_id":"capture-request-0003","app_key":"tasks-1","kind":"task","title":"No"}`); code != 403 {
		t.Fatal("unregistered capture destination accepted")
	}
	for _, raw := range []string{"http://example.com", "https://user:pass@example.com", "https://example.com?token=1", "https://example.com#x", "file:///tmp/private"} {
		if approvedAppURL(raw) != "" {
			t.Fatal("unsafe destination", raw)
		}
	}
}
func TestCaptureSameKeyIsPrivatePerPerson(t *testing.T) {
	var writes atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		writes.Add(1)
		writeJSON(w, 201, map[string]any{"id": writes.Load()})
	})
	body := `{"request_id":"same-request-key-0004","app_key":"notes-4","kind":"note","text":"A thought"}`
	for i, cookie := range []string{f.ann, f.bob} {
		code, out := f.post(t, cookie, body)
		if code != 201 || fmt.Sprint(out["id"]) != fmt.Sprint(i+1) {
			t.Fatal(code, out)
		}
	}
	if writes.Load() != 2 {
		t.Fatal("account receipts were shared")
	}
}

func TestDailyDoesNotTurnMalformedResponsesIntoZeroCounts(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]any{}) })
	_, out := get(t, f.hub, "/api/v1/daily", "", f.ann)
	for _, raw := range out["sources"].([]any) {
		source := raw.(map[string]any)
		if source["state"] != "unavailable" || len(source["metrics"].([]any)) != 0 {
			t.Fatal("malformed app response became invented data", source)
		}
	}
}

func TestCaptureInFlightDuplicateIsNotSent(t *testing.T) {
	entered, release := make(chan struct{}), make(chan struct{})
	var writes atomic.Int32
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) {
		if writes.Add(1) == 1 {
			close(entered)
			<-release
		}
		writeJSON(w, 201, map[string]any{"id": 77})
	})
	body := `{"request_id":"concurrent-request-0001","app_key":"tasks-1","kind":"task","title":"Once only"}`
	done := make(chan int, 1)
	go func() { code, _ := f.post(t, f.ann, body); done <- code }()
	<-entered
	code, out := f.post(t, f.ann, body)
	close(release)
	if code != 409 || out["status"] != "unknown" {
		t.Fatal(code, out)
	}
	if code = <-done; code != 201 {
		t.Fatal(code)
	}
	if code, out = f.post(t, f.ann, body); code != 201 || out["id"] != float64(77) {
		t.Fatal(code, out)
	}
	if writes.Load() != 1 {
		t.Fatal("concurrent capture duplicated the upstream write")
	}
}

func TestCaptureRequiresARecordReceipt(t *testing.T) {
	f := dailySetup(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 201, map[string]any{}) })
	code, out := f.post(t, f.ann, `{"request_id":"missing-receipt-0001","app_key":"notes-4","kind":"note","text":"An idea"}`)
	if code != 502 || out["status"] != "unknown" {
		t.Fatal("missing receipt reported as saved", code, out)
	}
}
