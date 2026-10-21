package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
)

// The hub is a window on Pocket Core. Everything a person sees comes from
// Core as that person (their own OIDC tokens from "Sign in with Pocket Core",
// or the Core token a phone presented); only the registry's health column is
// read with the hub's app token, and only for apps already in the person's list.

var errNoGrant = errors.New("no Pocket Core grant for this session")

var coreHTTP = &http.Client{Timeout: 15 * time.Second}

type coreService struct {
	ID     int64  `json:"id"`
	Type   string `json:"type"`
	Name   string `json:"name"`
	Group  string `json:"group"`
	URL    string `json:"url"`
	Open   string `json:"open_url"`
	Icon   string `json:"icon"`
	Pocket bool   `json:"pocket"`
}

type coreApp struct {
	ID          int64  `json:"id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Version     string `json:"version"`
	PublicURL   string `json:"public_url"`
	Status      string `json:"status"`
	LastSeenAt  string `json:"last_seen_at"`
	LastCheckAt string `json:"last_check_at"`
	LastError   string `json:"last_error"`
	Manifest    struct {
		Publishes []string `json:"publishes"`
		Offers    []struct {
			Scope string `json:"scope"`
			Name  string `json:"name"`
		} `json:"offers"`
	} `json:"manifest"`
}

type coreSystem struct {
	Version   string         `json:"version"`
	UptimeS   int64          `json:"uptime_s"`
	BoxName   string         `json:"box_name"`
	BaseURL   string         `json:"base_url"`
	Counts    map[string]int `json:"counts"`
	Listeners int            `json:"listeners"`
}

// LauncherApp is one tile.
type LauncherApp struct {
	Key         string   `json:"key"`
	ID          int64    `json:"id"`
	Type        string   `json:"type"`
	Slug        string   `json:"slug,omitempty"`
	Name        string   `json:"name"`
	Group       string   `json:"group"`
	URL         string   `json:"url"`
	OpenURL     string   `json:"open_url"`
	Icon        string   `json:"icon"`
	Pocket      bool     `json:"pocket"`
	Status      string   `json:"status"` // ok | down | "" (not health-checked)
	Version     string   `json:"version,omitempty"`
	Description string   `json:"description,omitempty"`
	LastSeenAt  string   `json:"last_seen_at,omitempty"`
	LastError   string   `json:"last_error,omitempty"`
	Publishes   []string `json:"publishes,omitempty"`
}

// coreGet performs an authenticated GET against Core.
func (s *Server) coreGet(ctx context.Context, path, bearer string, out any) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.core.BaseURL()+path, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+bearer)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "pocket-hub/"+Version)
	res, err := coreHTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if res.StatusCode != http.StatusOK {
		var e apiError
		_ = json.Unmarshal(body, &e)
		return res.StatusCode, fmt.Errorf("core %s: HTTP %d %s", path, res.StatusCode, e.Error)
	}
	if out != nil {
		if err := json.Unmarshal(body, out); err != nil {
			return res.StatusCode, fmt.Errorf("core %s: %w", path, err)
		}
	}
	return res.StatusCode, nil
}

// cached keeps a Core read for ttl; key must include the principal when the read is personal.
func (s *Server) cached(key string, ttl time.Duration, fn func() (any, error)) (any, error) {
	type entry struct {
		v  any
		at time.Time
	}
	if e, ok := s.cache.Load(key); ok {
		if en := e.(entry); time.Since(en.at) < ttl {
			return en.v, nil
		}
	}
	v, err := fn()
	if err != nil {
		return nil, err
	}
	s.cache.Store(key, entry{v: v, at: time.Now()})
	return v, nil
}

// coreApps is the registry, read with the hub's own token (10 s cache).
func (s *Server) coreApps(ctx context.Context) ([]coreApp, error) {
	if s.core.Token() == "" {
		return nil, errors.New("not registered with Pocket Core yet")
	}
	v, err := s.cached("apps", 10*time.Second, func() (any, error) {
		var out []coreApp
		if _, err := s.coreGet(ctx, "/api/v1/apps", s.core.Token(), &out); err != nil {
			return nil, err
		}
		return out, nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]coreApp), nil
}

// coreSystemInfo is Core's /system, read with the hub's own token (30 s cache).
func (s *Server) coreSystemInfo(ctx context.Context) (*coreSystem, error) {
	v, err := s.cached("system", 30*time.Second, func() (any, error) {
		var out coreSystem
		tok := s.core.Token()
		if _, err := s.coreGet(ctx, "/api/v1/system", tok, &out); err != nil {
			return nil, err
		}
		return &out, nil
	})
	if err != nil {
		return nil, err
	}
	return v.(*coreSystem), nil
}

// corePublicURL is what a browser opens for Core.
func (s *Server) corePublicURL() string {
	if s.cfg.CorePublicURL != "" {
		return s.cfg.CorePublicURL
	}
	if o := s.core.OIDC(); o.Issuer != "" {
		return strings.TrimRight(o.Issuer, "/")
	}
	return s.cfg.CoreURL
}

// userCoreToken returns a token that lets the hub act as the person at Core:
// the bearer they presented, or the session's grant (refreshed when stale).
func (s *Server) userCoreToken(ctx context.Context, p *principal) (string, error) {
	if p == nil || !s.core.Configured() {
		return "", errNoGrant
	}
	if p.bearer != "" {
		return p.bearer, nil
	}
	if p.session == "" {
		return "", errNoGrant
	}
	g, err := s.store.GetGrant(ctx, p.session)
	if err != nil {
		return "", errNoGrant
	}
	if time.Until(g.ExpiresAt) > 90*time.Second {
		return g.AccessToken, nil
	}
	if g.RefreshToken == "" {
		return "", errNoGrant
	}
	mu := s.sessionMutex(g.SessionHash)
	mu.Lock()
	defer mu.Unlock()
	// another request may have refreshed while we waited
	if g2, err := s.store.GetGrant(ctx, p.session); err == nil && time.Until(g2.ExpiresAt) > 90*time.Second {
		return g2.AccessToken, nil
	}
	issuer, clientID, secret, _ := s.oidcSettings()
	if issuer == "" {
		return "", errNoGrant
	}
	d, err := s.provider(issuer).discovery(ctx)
	if err != nil {
		return "", err
	}
	form := url.Values{"grant_type": {"refresh_token"}, "refresh_token": {g.RefreshToken}, "client_id": {clientID}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, d.Token, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	if secret != "" {
		req.SetBasicAuth(url.QueryEscape(clientID), url.QueryEscape(secret))
	}
	res, err := oidcHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	var tok struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int64  `json:"expires_in"`
		Error        string `json:"error"`
	}
	_ = json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&tok)
	if res.StatusCode != http.StatusOK || tok.AccessToken == "" {
		// the refresh token was revoked or rotated away: forget it, the person signs in again
		_ = s.store.DeleteGrant(ctx, p.session)
		s.log.Info("core grant refresh refused", "status", res.StatusCode, "err", tok.Error)
		return "", errNoGrant
	}
	ttl := time.Duration(tok.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = 50 * time.Minute
	}
	if err := s.store.SaveGrant(ctx, p.session, tok.AccessToken, firstNonEmpty(tok.RefreshToken, g.RefreshToken), time.Now().Add(ttl)); err != nil {
		return "", err
	}
	return tok.AccessToken, nil
}

func (s *Server) sessionMutex(hash string) *sync.Mutex {
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	if m, ok := s.refreshes[hash]; ok {
		return m
	}
	m := &sync.Mutex{}
	s.refreshes[hash] = m
	if len(s.refreshes) > 1000 {
		s.refreshes = map[string]*sync.Mutex{hash: m}
	}
	return m
}

// myServices is the person's launcher list from Core.
func (s *Server) myServices(ctx context.Context, p *principal) ([]coreService, error) {
	tok, err := s.userCoreToken(ctx, p)
	if err != nil {
		return nil, err
	}
	var out []coreService
	status, err := s.coreGet(ctx, "/api/v1/me/services", tok, &out)
	if status == http.StatusUnauthorized && p.session != "" {
		_ = s.store.DeleteGrant(ctx, p.session)
		return nil, errNoGrant
	}
	return out, err
}

// handleLauncher is the home screen in one call.
func (s *Server) handleLauncher(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	p := principalFrom(ctx)
	out := map[string]any{"me": p.user, "prefs": s.store.GetPrefs(ctx, p.user.ID), "core": "ok", "apps": []LauncherApp{}, "refresh_seconds": s.cfg.RefreshSeconds}
	if !s.core.Configured() {
		out["core"] = "unconfigured"
		writeJSON(w, http.StatusOK, out)
		return
	}
	services, err := s.myServices(ctx, p)
	if errors.Is(err, errNoGrant) {
		out["core"] = "reconnect"
		writeJSON(w, http.StatusOK, out)
		return
	}
	if err != nil {
		out["core"] = "unreachable"
		out["error"] = err.Error()
		writeJSON(w, http.StatusOK, out)
		return
	}
	registry := map[string]coreApp{}
	if apps, err := s.coreApps(ctx); err == nil {
		for _, a := range apps {
			registry[a.Slug] = a
		}
	}
	tiles := make([]LauncherApp, 0, len(services)+1)
	for _, sv := range services {
		if sv.Type == "hub" {
			continue
		}
		t := LauncherApp{Key: fmt.Sprintf("%s-%d", sv.Type, sv.ID), ID: sv.ID, Type: sv.Type, Name: sv.Name, Group: sv.Group, URL: sv.URL, OpenURL: sv.Open, Icon: sv.Icon, Pocket: sv.Pocket}
		if a, ok := registry[sv.Type]; ok && sv.Pocket {
			t.Slug, t.Status, t.Version, t.Description, t.LastSeenAt, t.LastError, t.Publishes = a.Slug, a.Status, a.Version, a.Description, a.LastSeenAt, a.LastError, a.Manifest.Publishes
			if t.Icon == "" && a.Icon != "" {
				t.Icon = strings.TrimRight(firstNonEmpty(a.PublicURL, sv.URL), "/") + "/" + strings.TrimLeft(a.Icon, "/")
			}
		}
		tiles = append(tiles, t)
	}
	// Core itself is a place too
	coreTile := LauncherApp{Key: "core", Type: "core", Slug: "core", Name: "Pocket Core", Group: "Pocket", URL: s.corePublicURL(), OpenURL: s.corePublicURL(), Icon: s.corePublicURL() + "/favicon.svg", Pocket: true, Status: "ok",
		Description: "The hub of the box: app registry, event bus, single sign-on and device pairing."}
	box := map[string]any{"name": "Pocket Box", "core_url": s.corePublicURL()}
	if sys, err := s.coreSystemInfo(ctx); err == nil {
		box["name"] = firstNonEmpty(sys.BoxName, "Pocket Box")
		box["core_version"] = sys.Version
		box["core_uptime_s"] = sys.UptimeS
		box["counts"] = sys.Counts
		coreTile.Version = sys.Version
	}
	tiles = append(tiles, coreTile)
	sort.SliceStable(tiles, func(i, j int) bool {
		if tiles[i].Group != tiles[j].Group {
			return groupRank(tiles[i].Group) < groupRank(tiles[j].Group)
		}
		return strings.ToLower(tiles[i].Name) < strings.ToLower(tiles[j].Name)
	})
	up, checked := 0, 0
	for _, t := range tiles {
		if t.Status != "" {
			checked++
			if t.Status == "ok" {
				up++
			}
		}
	}
	box["apps_up"], box["apps_checked"] = up, checked
	out["apps"], out["box"] = tiles, box
	writeJSON(w, http.StatusOK, out)
}

var groupOrder = []string{"Pocket", "Media", "Life", "Money", "Files", "Downloads", "Server"}

func groupRank(g string) int {
	for i, x := range groupOrder {
		if x == g {
			return i
		}
	}
	return len(groupOrder)
}

// ---------- activity ----------

// visibility is the rule for what a person may see on the feed: events about
// them, and household events (no person attached) from apps they have.
type visibility struct {
	email string
	admin bool
	types map[string]bool
}

func (v visibility) sees(e core.Event) bool {
	var p struct {
		UserEmail  string `json:"user_email"`
		OwnerEmail string `json:"owner_email"`
	}
	_ = json.Unmarshal(e.Payload, &p)
	if who := firstNonEmpty(p.UserEmail, p.OwnerEmail); who != "" {
		return strings.EqualFold(who, v.email)
	}
	prefix := e.Topic
	if i := strings.Index(prefix, "."); i > 0 {
		prefix = prefix[:i]
	}
	if prefix == "core" {
		return strings.HasPrefix(e.Topic, "core.app.") || v.admin
	}
	return v.types[prefix]
}

// handleActivity lists what happened lately, as far as Core lets this person see.
// Admins read the bus with their own token; members get their own doings in the
// Pocket apps that let the hub read them (events:read links), through the hub's token.
func (s *Server) handleActivity(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	p := principalFrom(ctx)
	if !s.core.Configured() {
		writeJSON(w, http.StatusOK, map[string]any{"events": []core.Event{}, "scope": "none"})
		return
	}
	services, err := s.myServices(ctx, p)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"events": []core.Event{}, "scope": "none", "error": err.Error()})
		return
	}
	v := visibility{email: strings.ToLower(p.user.Email), types: map[string]bool{"core": true}}
	for _, sv := range services {
		v.types[sv.Type] = true
	}
	limit := 300
	var events []core.Event
	scope := "mine"
	tok, _ := s.userCoreToken(ctx, p)
	status, err := s.coreGet(ctx, "/api/v1/events?limit="+fmt.Sprint(limit), tok, &events)
	if err == nil {
		scope, v.admin = "box", true
	} else if status != http.StatusForbidden && status != http.StatusUnauthorized {
		writeJSON(w, http.StatusOK, map[string]any{"events": []core.Event{}, "scope": "none", "error": err.Error()})
		return
	} else {
		events, err = s.core.Events(ctx, "", 0, limit)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"events": []core.Event{}, "scope": "none", "error": err.Error()})
			return
		}
	}
	// Consecutive repeats of the same thing (an app re-registering every half hour,
	// a health check flapping) collapse into one line.
	out := make([]core.Event, 0, len(events))
	last := ""
	for _, e := range events {
		if !v.sees(e) {
			continue
		}
		if k := e.Topic + "\x00" + e.Subject; k == last {
			continue
		} else {
			last = k
		}
		out = append(out, e)
		if len(out) == 100 {
			break
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": out, "scope": scope})
}

// ---------- prefs ----------

func (s *Server) handleGetPrefs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.store.GetPrefs(r.Context(), userFrom(r.Context()).ID))
}

func (s *Server) handlePutPrefs(w http.ResponseWriter, r *http.Request) {
	var in map[string]json.RawMessage
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	b, _ := json.Marshal(in)
	// Personal widgets may contain notes and checklists in multibyte scripts.
	if len(b) > 256<<10 {
		writeErr(w, http.StatusRequestEntityTooLarge, "preferences are too large")
		return
	}
	if err := s.store.SetPrefs(r.Context(), userFrom(r.Context()).ID, b); err != nil {
		s.fail(w, err, "save preferences")
		return
	}
	writeJSON(w, http.StatusOK, json.RawMessage(b))
}
