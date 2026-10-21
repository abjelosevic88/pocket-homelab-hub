package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
	"github.com/abjelosevic88/pocket-homelab-hub/internal/config"
	"github.com/abjelosevic88/pocket-homelab-hub/internal/store"
)

// fakeCore answers the handful of Core endpoints the hub reads, and records
// which bearer token asked for the person's launcher.
func fakeCore(t *testing.T, asked *[]string) *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/me/services", func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		*asked = append(*asked, tok)
		if tok != "pcu_ann" && tok != "pcd_phone" {
			w.WriteHeader(401)
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"id": 1, "type": "habits", "name": "Pocket Habits", "group": "Pocket", "url": "https://habits.example", "open_url": "https://habits.example/api/v1/auth/oidc/start", "icon": "https://habits.example/favicon.svg", "pocket": true},
			{"id": 2, "type": "jellyfin", "name": "Jellyfin", "group": "Media", "url": "https://jf.example", "open_url": "https://jf.example", "icon": "", "pocket": false},
			{"id": 3, "type": "hub", "name": "Pocket Hub", "group": "Pocket", "url": "https://hub.example", "open_url": "https://hub.example", "icon": "", "pocket": true},
		})
	})
	mux.HandleFunc("/api/v1/apps", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{{"id": 7, "slug": "habits", "name": "Pocket Habits", "version": "1.0", "status": "ok", "public_url": "https://habits.example", "manifest": map[string]any{"publishes": []string{"habits.marked"}, "offers": []map[string]any{{"scope": "events:read", "name": "Read activity events"}}}}})
	})
	mux.HandleFunc("/api/v1/system", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"version": "0.1", "box_name": "Test Box", "uptime_s": 5})
	})
	mux.HandleFunc("/api/v1/auth/introspect", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Token string }
		_ = json.NewDecoder(r.Body).Decode(&in)
		switch in.Token {
		case "pcd_phone":
			_ = json.NewEncoder(w).Encode(map[string]any{"active": true, "kind": "device", "iss": "core", "user": map[string]any{"id": 2, "email": "ann@example.com", "name": "Ann", "role": "member"}})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"active": false})
		}
	})
	mux.HandleFunc("/api/v1/auth/subject", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"active": true, "iss": "core"})
	})
	mux.HandleFunc("/api/v1/events", func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ") == "pcu_ann" {
			w.WriteHeader(403)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "admin only"})
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"id": 1, "topic": "habits.marked", "source": "habits", "payload": map[string]any{"user_email": "ann@example.com"}},
			{"id": 2, "topic": "habits.marked", "source": "habits", "payload": map[string]any{"user_email": "bob@example.com"}},
			{"id": 3, "topic": "jellyfin.item_added", "source": "connector:jellyfin", "payload": map[string]any{"title": "Dune"}},
			{"id": 4, "topic": "radarr.grabbed", "source": "connector:radarr", "payload": map[string]any{"title": "x"}},
			{"id": 5, "topic": "core.device.paired", "source": "core", "payload": map[string]any{}},
			{"id": 6, "topic": "jellyfin.item_added", "source": "connector:jellyfin", "subject": "item:9", "payload": map[string]any{"title": "Dune"}},
			{"id": 7, "topic": "jellyfin.item_added", "source": "connector:jellyfin", "subject": "item:9", "payload": map[string]any{"title": "Dune"}},
		})
	})
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return ts
}

func newHub(t *testing.T, coreURL string) (*Server, *httptest.Server) {
	dir := t.TempDir()
	cfg := &config.Config{AuthMode: "local", SessionTTL: time.Hour, DataDir: dir, DBPath: dir + "/t.db", CoreURL: coreURL, PasswordLogin: true, RefreshSeconds: 45}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	st, err := store.Open(cfg.DBPath, log)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	s := New(cfg, st, log, nil)
	s.core = core.New(coreURL, core.Options{DB: st.DB, Token: "pca_hub"})
	if err := s.core.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(s.Router())
	t.Cleanup(ts.Close)
	return s, ts
}

func get(t *testing.T, ts *httptest.Server, path, bearer, cookie string) (int, map[string]any) {
	req, _ := http.NewRequest(http.MethodGet, ts.URL+path, nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: sessionCookie, Value: cookie})
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

// The launcher is read as the person: with the grant their sign-in left behind
// (or the Core token a phone presented), never with the hub's app token. The
// hub's own tile is dropped, Core's tile is added, registry health is merged.
func TestLauncherIsPersonal(t *testing.T) {
	var asked []string
	cs := fakeCore(t, &asked)
	s, ts := newHub(t, cs.URL)
	ctx := context.Background()
	ann := &store.User{Email: "ann@example.com", Name: "Ann", Role: "member"}
	_ = s.store.CreateUser(ctx, ann)
	sess, _ := s.store.CreateSession(ctx, ann.ID, time.Hour)

	// no grant yet: the UI is told to reconnect, nothing is read with pca_hub
	code, out := get(t, ts, "/api/v1/launcher", "", sess)
	if code != 200 || out["core"] != "reconnect" {
		t.Fatalf("without a grant: %d %v", code, out)
	}
	_ = s.store.SaveGrant(ctx, sess, "pcu_ann", "", time.Now().Add(time.Hour))
	code, out = get(t, ts, "/api/v1/launcher", "", sess)
	if code != 200 || out["core"] != "ok" {
		t.Fatalf("with a grant: %d %v", code, out)
	}
	apps := out["apps"].([]any)
	names := []string{}
	for _, a := range apps {
		m := a.(map[string]any)
		names = append(names, m["name"].(string))
		if m["name"] == "Pocket Habits" && (m["status"] != "ok" || m["version"] != "1.0" || m["open_url"] != "https://habits.example/api/v1/auth/oidc/start") {
			t.Errorf("registry not merged: %v", m)
		}
	}
	if strings.Join(names, ",") != "Pocket Core,Pocket Habits,Jellyfin" {
		t.Errorf("tiles: %v", names)
	}
	if out["box"].(map[string]any)["name"] != "Test Box" {
		t.Errorf("box: %v", out["box"])
	}
	for _, a := range asked {
		if a == "pca_hub" {
			t.Fatal("the launcher was read with the app token")
		}
	}

	// a phone's own Core token works directly
	code, out = get(t, ts, "/api/v1/launcher", "pcd_phone", "")
	if code != 200 || out["core"] != "ok" || len(out["apps"].([]any)) != 3 {
		t.Errorf("device token: %d %v", code, out["core"])
	}
	// a stranger's token is refused
	if code, _ := get(t, ts, "/api/v1/launcher", "pcd_nope", ""); code != 401 {
		t.Errorf("stranger: %d", code)
	}

	// a grant Core no longer honours is forgotten and the UI is told to reconnect
	_ = s.store.SaveGrant(ctx, sess, "pcu_stale", "", time.Now().Add(time.Hour))
	if code, out := get(t, ts, "/api/v1/launcher", "", sess); code != 200 || out["core"] != "reconnect" {
		t.Errorf("stale grant: %d %v", code, out["core"])
	}
	if _, err := s.store.GetGrant(ctx, sess); err == nil {
		t.Error("stale grant kept")
	}
}

// Members get their own doings and household events from apps on their list;
// never another person's, never admin-only Core events.
func TestActivityVisibility(t *testing.T) {
	var asked []string
	cs := fakeCore(t, &asked)
	s, ts := newHub(t, cs.URL)
	ctx := context.Background()
	ann := &store.User{Email: "ann@example.com", Name: "Ann", Role: "member"}
	_ = s.store.CreateUser(ctx, ann)
	sess, _ := s.store.CreateSession(ctx, ann.ID, time.Hour)
	_ = s.store.SaveGrant(ctx, sess, "pcu_ann", "", time.Now().Add(time.Hour))
	code, out := get(t, ts, "/api/v1/activity", "", sess)
	if code != 200 || out["scope"] != "mine" {
		t.Fatalf("%d %v", code, out)
	}
	ids := []float64{}
	for _, e := range out["events"].([]any) {
		ids = append(ids, e.(map[string]any)["id"].(float64))
	}
	if len(ids) != 3 || ids[0] != 1 || ids[1] != 3 || ids[2] != 6 {
		t.Errorf("member sees %v (want own habits.marked + household jellyfin, repeats collapsed)", ids)
	}
}

// Preferences are per person: one account's layout never shows up for another.
func TestPrefsPerPerson(t *testing.T) {
	var asked []string
	cs := fakeCore(t, &asked)
	s, ts := newHub(t, cs.URL)
	ctx := context.Background()
	ann := &store.User{Email: "ann@example.com", Role: "admin"}
	bob := &store.User{Email: "bob@example.com", Role: "member"}
	_ = s.store.CreateUser(ctx, ann)
	_ = s.store.CreateUser(ctx, bob)
	sa, _ := s.store.CreateSession(ctx, ann.ID, time.Hour)
	sb, _ := s.store.CreateSession(ctx, bob.ID, time.Hour)
	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/api/v1/prefs", strings.NewReader(`{"wallpaper":"ember","pinned":["core"]}`))
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: sa})
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("put prefs: %v %d", err, res.StatusCode)
	}
	if _, out := get(t, ts, "/api/v1/prefs", "", sa); out["wallpaper"] != "ember" {
		t.Errorf("ann's prefs: %v", out)
	}
	if _, out := get(t, ts, "/api/v1/prefs", "", sb); len(out) != 0 {
		t.Errorf("bob sees ann's prefs: %v", out)
	}
	if code, _ := get(t, ts, "/api/v1/prefs", "", ""); code != 401 {
		t.Errorf("anonymous: %d", code)
	}
}
