package server

import (
	"context"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
	"github.com/abjelosevic88/pocket-homelab-hub/internal/store"
)

type ctxKey int

const principalKey ctxKey = 1

const sessionCookie = "phub_session"

// principal is who is calling and how the hub may act as them at Core:
// a session with a stored Core grant, or a Core token the caller presented itself.
type principal struct {
	user    *store.User
	session string // hub session id (cookie)
	bearer  string // a Core-issued token (pcd_/pcu_/pco_) the request carried
}

func principalFrom(ctx context.Context) *principal {
	p, _ := ctx.Value(principalKey).(*principal)
	return p
}

func userFrom(ctx context.Context) *store.User {
	if p := principalFrom(ctx); p != nil {
		return p.user
	}
	return nil
}

// requireAuth resolves the current user from a session cookie or a Core token.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, err := s.resolve(r)
		if err != nil || p == nil || p.user == nil {
			writeErr(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey, p)))
	})
}

func (s *Server) resolve(r *http.Request) (*principal, error) {
	ctx := r.Context()
	tok := ""
	if h := r.Header.Get("Authorization"); strings.HasPrefix(strings.ToLower(h), "bearer ") {
		tok = strings.TrimSpace(h[7:])
	} else if t := r.Header.Get("X-API-Key"); t != "" {
		tok = t
	}
	if tok != "" {
		if s.core.Configured() && core.IsCoreToken(tok) {
			u, err := s.coreUser(ctx, tok)
			if err != nil {
				return nil, err
			}
			return &principal{user: u, bearer: tok}, nil
		}
		return nil, http.ErrNoCookie
	}
	if s.cfg.AuthMode == "none" {
		u, err := s.firstOrSystemUser(ctx, "admin@localhost", "Admin")
		if err != nil {
			return nil, err
		}
		return &principal{user: u}, nil
	}
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return nil, err
	}
	u, err := s.sessionUser(ctx, c.Value)
	if err != nil {
		return nil, err
	}
	return &principal{user: u, session: c.Value}, nil
}

// coreUser validates a token Pocket Core issued to a paired phone (pcd_), a
// person (pcu_) or an OIDC client (pco_) and maps it to the local account
// with the same email, creating a member on first sight.
func (s *Server) coreUser(ctx context.Context, tok string) (*store.User, error) {
	in, err := s.core.Introspect(ctx, tok)
	if err != nil {
		return nil, err
	}
	if !in.Active || in.User == nil || in.User.Email == "" {
		return nil, http.ErrNoCookie
	}
	return s.coreIdentityUser(ctx, in)
}

// firstOrSystemUser finds or creates an account. The first account on the box
// is its owner (admin); everyone after is a member.
func (s *Server) firstOrSystemUser(ctx context.Context, email, name string) (*store.User, error) {
	if u, err := s.store.GetUserByEmail(ctx, email); err == nil {
		return u, nil
	}
	role := "member"
	if n, err := s.store.CountUsers(ctx); err == nil && n == 0 {
		role = "admin"
	}
	u := &store.User{Email: email, Name: name, Role: role}
	if err := s.store.CreateUser(ctx, u); err != nil {
		return nil, err
	}
	s.log.Info("auto-provisioned user", "email", email, "role", role)
	return u, nil
}

func (s *Server) setSessionCookie(w http.ResponseWriter, id string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: id, Path: "/", HttpOnly: true,
		Secure: s.cfg.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: int(ttl.Seconds()),
	})
}

func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	n, err := s.store.CountUsers(r.Context())
	if err != nil {
		s.fail(w, err, "count users")
		return
	}
	p, _ := s.resolve(r)
	var u *store.User
	if p != nil {
		u = p.user
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"needs_setup":    n == 0 && s.cfg.AuthMode == "local" && s.cfg.PasswordLogin,
		"auth_mode":      s.cfg.AuthMode,
		"authenticated":  u != nil,
		"user":           u,
		"version":        Version,
		"title":          firstNonEmpty(s.store.GetSetting(r.Context(), "title"), "Pocket Hub"),
		"oidc":           s.oidcEnabled() && s.cfg.AuthMode == "local",
		"oidc_name":      s.oidcName(),
		"password_login": s.cfg.PasswordLogin && s.cfg.AuthMode == "local",
		"core":           s.core.Configured(),
	})
}

func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	n, err := s.store.CountUsers(ctx)
	if err != nil {
		s.fail(w, err, "count users")
		return
	}
	if n > 0 || s.cfg.AuthMode != "local" || !s.cfg.PasswordLogin {
		writeErr(w, http.StatusForbidden, "setup already completed")
		return
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	in.Email = strings.TrimSpace(strings.ToLower(in.Email))
	if in.Email == "" || len(in.Password) < 8 {
		writeErr(w, http.StatusBadRequest, "email and a password of at least 8 characters are required")
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	u := &store.User{Email: in.Email, Name: in.Name, PasswordHash: string(hash), Role: "admin"}
	if err := s.store.CreateUser(ctx, u); err != nil {
		s.fail(w, err, "create user")
		return
	}
	id, err := s.store.CreateSession(ctx, u.ID, s.cfg.SessionTTL)
	if err != nil {
		s.fail(w, err, "create session")
		return
	}
	s.setSessionCookie(w, id, s.cfg.SessionTTL)
	s.log.Info("initial setup completed", "email", u.Email)
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.PasswordLogin || s.cfg.AuthMode != "local" {
		writeErr(w, http.StatusForbidden, "password sign-in is switched off")
		return
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	u, err := s.store.GetUserByEmail(r.Context(), strings.TrimSpace(strings.ToLower(in.Email)))
	if err != nil || u.PasswordHash == "" || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil {
		time.Sleep(300 * time.Millisecond)
		writeErr(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	id, err := s.store.CreateSession(r.Context(), u.ID, s.cfg.SessionTTL)
	if err != nil {
		s.fail(w, err, "create session")
		return
	}
	s.setSessionCookie(w, id, s.cfg.SessionTTL)
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = s.store.DeleteSession(r.Context(), c.Value)
	}
	s.setSessionCookie(w, "", -1)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	p := principalFrom(r.Context())
	_, grantErr := s.userCoreToken(r.Context(), p)
	writeJSON(w, http.StatusOK, map[string]any{"user": p.user, "core_linked": s.core.Configured() && grantErr == nil})
}

func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in struct {
		Name            string `json:"name"`
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if in.Name != "" {
		u.Name = strings.TrimSpace(in.Name)
	}
	if in.NewPassword != "" {
		if u.PasswordHash != "" && bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.CurrentPassword)) != nil {
			writeErr(w, http.StatusBadRequest, "current password is incorrect")
			return
		}
		if len(in.NewPassword) < 8 {
			writeErr(w, http.StatusBadRequest, "password must be at least 8 characters")
			return
		}
		h, _ := bcrypt.GenerateFromPassword([]byte(in.NewPassword), bcrypt.DefaultCost)
		u.PasswordHash = string(h)
	}
	if err := s.store.UpdateUser(r.Context(), u); err != nil {
		s.fail(w, err, "update user")
		return
	}
	writeJSON(w, http.StatusOK, u)
}
