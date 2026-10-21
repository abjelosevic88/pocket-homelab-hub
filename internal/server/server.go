// Package server wires the HTTP API, auth and the embedded SPA.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/crypto/bcrypt"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
	"github.com/abjelosevic88/pocket-homelab-hub/internal/config"
	"github.com/abjelosevic88/pocket-homelab-hub/internal/store"
)

// Version is injected at build time.
var Version = "dev"

// Server holds dependencies.
type Server struct {
	cfg      *config.Config
	store    *store.Store
	log      *slog.Logger
	webFS    fs.FS
	started  time.Time
	requests atomic.Int64
	errors   atomic.Int64

	core    *core.Client
	coreMu  sync.Mutex
	coreOK  bool
	coreErr string
	uses    []core.Use // events:read links to every Pocket app that offers them

	oidc   *oidcProvider // keyed on the issuer; rebuilt by provider() when it changes
	oidcMu sync.Mutex

	refreshMu sync.Mutex
	refreshes map[string]*sync.Mutex // per session: one refresh at a time
	cache     sync.Map               // small response cache for Core reads
}

// New creates a server.
func New(cfg *config.Config, st *store.Store, log *slog.Logger, webFS fs.FS) *Server {
	return &Server{cfg: cfg, store: st, log: log, webFS: webFS, started: time.Now(),
		core:      core.New(cfg.CoreURL, core.Options{DB: st.DB, TokenFile: cfg.DataDir + "/core.token", UserAgent: "pocket-hub/" + Version}),
		oidc:      &oidcProvider{issuerURL: cfg.OIDCIssuer},
		refreshes: map[string]*sync.Mutex{}}
}

// Bootstrap seeds the first admin (if configured) and starts the Core registration loop.
func (s *Server) Bootstrap(ctx context.Context) error {
	if err := s.core.Start(ctx); err != nil {
		return err
	}
	n, err := s.store.CountUsers(ctx)
	if err != nil {
		return err
	}
	if n == 0 && s.cfg.AuthMode == "local" && s.cfg.AdminEmail != "" && s.cfg.AdminPassword != "" {
		if len(s.cfg.AdminPassword) < 8 {
			return errors.New("ADMIN_PASSWORD must be at least 8 characters")
		}
		h, _ := bcrypt.GenerateFromPassword([]byte(s.cfg.AdminPassword), bcrypt.DefaultCost)
		u := &store.User{Email: s.cfg.AdminEmail, Name: s.cfg.AdminName, PasswordHash: string(h), Role: "admin"}
		if err := s.store.CreateUser(ctx, u); err != nil {
			return err
		}
		s.log.Info("admin user created from environment", "email", u.Email)
	}
	_ = s.store.PurgeSessions(ctx)
	if s.core.Configured() {
		go s.coreLoop(ctx)
	}
	return nil
}

// Router builds the chi router.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	if s.cfg.TrustProxy {
		r.Use(middleware.RealIP)
	}
	r.Use(middleware.RequestID)
	r.Use(s.logging)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/healthz", s.handleHealth)
	r.Get("/readyz", s.handleReady)
	if s.cfg.MetricsEnabled {
		r.Get("/metrics", s.handleMetrics)
	}

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/login", s.handleLogin)
		r.Post("/auth/setup", s.handleSetup)
		r.Get("/auth/status", s.handleAuthStatus)
		r.Get("/auth/oidc/start", s.handleOIDCStart)
		r.Get("/auth/oidc/callback", s.handleOIDCCallback)

		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Post("/auth/logout", s.handleLogout)
			r.Get("/auth/me", s.handleMe)
			r.Put("/auth/me", s.handleUpdateMe)

			r.Get("/launcher", s.handleLauncher)
			r.Get("/activity", s.handleActivity)
			r.Get("/prefs", s.handleGetPrefs)
			r.Put("/prefs", s.handlePutPrefs)
			r.Get("/system", s.handleSystemInfo)
		})
	})

	r.NotFound(s.handleSPA)
	return r
}

// ---------- helpers ----------

func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		s.requests.Add(1)
		if ww.Status() >= 500 {
			s.errors.Add(1)
		}
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			return
		}
		s.log.Debug("http", "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "dur", time.Since(start).String(), "ip", r.RemoteAddr)
	})
}

type apiError struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, apiError{Error: msg})
}

func (s *Server) fail(w http.ResponseWriter, err error, context string) {
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.log.Error(context, "err", err)
	writeErr(w, http.StatusInternalServerError, context+": "+err.Error())
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	return dec.Decode(v)
}

// ---------- Pocket Core ----------

// coreLoop registers with Core on start (retrying until it answers) and
// re-registers every 30 minutes so version and last-seen stay fresh.
func (s *Server) coreLoop(ctx context.Context) {
	wait := 5 * time.Second
	for {
		err := s.registerWithCore(ctx)
		s.coreMu.Lock()
		s.coreOK, s.coreErr = err == nil, ""
		if err != nil {
			s.coreErr = err.Error()
		}
		s.coreMu.Unlock()
		if err != nil {
			s.log.Warn("pocket core: registration failed, retrying", "err", err, "in", wait.String())
		} else {
			wait = 30 * time.Minute
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		if err != nil && wait < 5*time.Minute {
			wait *= 2
		}
	}
}

func (s *Server) manifest() core.Manifest {
	m := core.Manifest{
		Slug: "hub", Name: "Pocket Hub",
		Description: "The home screen of the box: every app a person may open, signed in with one tap, with live status and what happened lately.",
		Icon:        "/favicon.svg", Version: Version,
		URL: s.cfg.CoreAppURL, PublicURL: s.cfg.BaseURL, HealthPath: "/healthz", EnvPrefix: "HUB",
	}
	if s.cfg.BaseURL != "" {
		m.OIDC = &core.OIDCRequest{RedirectURIs: []string{s.cfg.BaseURL + "/api/v1/auth/oidc/callback"}}
	}
	s.coreMu.Lock()
	m.Uses = append([]core.Use(nil), s.uses...)
	s.coreMu.Unlock()
	return m
}

func (s *Server) registerWithCore(ctx context.Context) error {
	reg, err := s.core.Register(ctx, s.cfg.CoreRegistrationKey, s.manifest())
	if err != nil {
		return err
	}
	if reg.Token != "" {
		s.log.Info("pocket core: registered, app token stored", "core", s.cfg.CoreURL)
	} else {
		s.log.Debug("pocket core: re-registered", "core", s.cfg.CoreURL)
	}
	// Ask for an events:read link to every Pocket app that offers one, so the
	// activity feed can show a person their own doings in those apps (each
	// person and the admin can switch any of these off in Core).
	apps, err := s.coreApps(ctx)
	if err != nil {
		return nil
	}
	var uses []core.Use
	for _, a := range apps {
		if a.Slug == "hub" {
			continue
		}
		for _, o := range a.Manifest.Offers {
			if o.Scope == "events:read" {
				uses = append(uses, core.Use{App: a.Slug, Scopes: []string{"events:read"}, Reason: "Show your activity in " + a.Name + " on the hub's activity feed"})
				break
			}
		}
	}
	sort.Slice(uses, func(i, j int) bool { return uses[i].App < uses[j].App })
	s.coreMu.Lock()
	changed := fmt.Sprint(uses) != fmt.Sprint(s.uses)
	s.uses = uses
	s.coreMu.Unlock()
	if changed {
		if _, err := s.core.Register(ctx, s.cfg.CoreRegistrationKey, s.manifest()); err != nil {
			s.log.Warn("pocket core: could not declare activity links", "err", err)
		} else {
			s.log.Info("pocket core: activity links declared", "apps", len(uses))
		}
	}
	return nil
}

// ---------- health / metrics ----------

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "version": Version, "uptime": time.Since(s.started).Round(time.Second).String()})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DB.PingContext(r.Context()); err != nil {
		writeErr(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	counts := s.store.Counts(r.Context())
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	fmt.Fprintf(w, "# HELP pocket_hub_info Build info.\n# TYPE pocket_hub_info gauge\npocket_hub_info{version=%q} 1\n", Version)
	fmt.Fprintf(w, "# HELP pocket_hub_uptime_seconds Process uptime.\n# TYPE pocket_hub_uptime_seconds gauge\npocket_hub_uptime_seconds %d\n", int(time.Since(s.started).Seconds()))
	fmt.Fprintf(w, "# HELP pocket_hub_http_requests_total HTTP requests served.\n# TYPE pocket_hub_http_requests_total counter\npocket_hub_http_requests_total %d\n", s.requests.Load())
	fmt.Fprintf(w, "# HELP pocket_hub_http_errors_total HTTP 5xx responses.\n# TYPE pocket_hub_http_errors_total counter\npocket_hub_http_errors_total %d\n", s.errors.Load())
	for k, v := range counts {
		fmt.Fprintf(w, "# TYPE pocket_hub_rows{table=%q} gauge\npocket_hub_rows{table=%q} %d\n", k, k, v)
	}
}

func (s *Server) handleSystemInfo(w http.ResponseWriter, r *http.Request) {
	s.coreMu.Lock()
	ok, errStr := s.coreOK, s.coreErr
	s.coreMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"version": Version, "uptime_s": int(time.Since(s.started).Seconds()), "base_url": s.cfg.BaseURL,
		"core":            map[string]any{"configured": s.core.Configured(), "url": s.cfg.CoreURL, "public_url": s.corePublicURL(), "registered": ok, "error": errStr},
		"refresh_seconds": s.cfg.RefreshSeconds,
	})
}

// ---------- static / SPA ----------

func (s *Server) handleSPA(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if s.webFS == nil {
		http.Error(w, "web UI not built (run `make web`)", http.StatusNotFound)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}
	if f, err := s.webFS.Open(path); err == nil {
		f.Close()
		if strings.HasPrefix(path, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.FileServerFS(s.webFS).ServeHTTP(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	r.URL.Path = "/"
	http.FileServerFS(s.webFS).ServeHTTP(w, r)
}
