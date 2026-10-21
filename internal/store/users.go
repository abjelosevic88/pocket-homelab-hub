package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"
)

// User is an account that can sign in.
type User struct {
	ID           int64  `json:"id"`
	Email        string `json:"email"`
	Name         string `json:"name"`
	PasswordHash string `json:"-"`
	Role         string `json:"role"`
	CreatedAt    string `json:"created_at"`
}

// IsAdmin reports whether the account owns the box.
func (u *User) IsAdmin() bool { return u != nil && u.Role == "admin" }

// Grant is a person's own Pocket Core tokens, tied to one hub session.
type Grant struct {
	SessionHash  string
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
}

// CountUsers returns the number of users.
func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM users`).Scan(&n)
	return n, err
}

// CreateUser inserts a user.
func (s *Store) CreateUser(ctx context.Context, u *User) error {
	res, err := s.DB.ExecContext(ctx, `INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)`, u.Email, u.Name, u.PasswordHash, u.Role)
	if err != nil {
		return err
	}
	u.ID, _ = res.LastInsertId()
	return nil
}

// UpdateUser updates name/email/password/role.
func (s *Store) UpdateUser(ctx context.Context, u *User) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET email = ?, name = ?, password_hash = ?, role = ?, updated_at = ? WHERE id = ?`, u.Email, u.Name, u.PasswordHash, u.Role, Now(), u.ID)
	return err
}

const userCols = `id, email, name, password_hash, role, created_at`

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Role, &u.CreatedAt); err != nil {
		return nil, notFound(err)
	}
	return &u, nil
}

// GetUser finds a user by id.
func (s *Store) GetUser(ctx context.Context, id int64) (*User, error) {
	return scanUser(s.DB.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id))
}

// GetUserByEmail finds a user by email.
func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(s.DB.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE email = ?`, email))
}

// ListUsers returns all users.
func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+userCols+` FROM users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

// RandomToken returns n random bytes hex encoded.
func RandomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// HashToken returns the sha256 hex digest of a token.
func HashToken(t string) string {
	h := sha256.Sum256([]byte(t))
	return hex.EncodeToString(h[:])
}

// CreateSession creates a session for a user and returns its id.
func (s *Store) CreateSession(ctx context.Context, userID int64, ttl time.Duration) (string, error) {
	id := RandomToken(32)
	_, err := s.DB.ExecContext(ctx, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`, HashToken(id), userID, time.Now().Add(ttl).UTC().Format(time.RFC3339))
	return id, err
}

// GetSessionUser resolves a session id to a user.
func (s *Store) GetSessionUser(ctx context.Context, sessionID string) (*User, error) {
	return scanUser(s.DB.QueryRowContext(ctx, `SELECT u.id, u.email, u.name, u.password_hash, u.role, u.created_at
		FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`, HashToken(sessionID), time.Now().UTC().Format(time.RFC3339)))
}

// DeleteSession removes a session (and its Core grant).
func (s *Store) DeleteSession(ctx context.Context, sessionID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, HashToken(sessionID))
	return err
}

// PurgeSessions removes expired sessions.
func (s *Store) PurgeSessions(ctx context.Context) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, time.Now().UTC().Format(time.RFC3339))
	return err
}

// SaveGrant stores (or replaces) the Core tokens of a session.
func (s *Store) SaveGrant(ctx context.Context, sessionID, access, refresh string, exp time.Time) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO core_grants (session_id, access_token, refresh_token, expires_at, updated_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
		HashToken(sessionID), access, refresh, exp.UTC().Format(time.RFC3339), Now())
	return err
}

// GetGrant reads the Core tokens of a session.
func (s *Store) GetGrant(ctx context.Context, sessionID string) (*Grant, error) {
	var g Grant
	var exp string
	g.SessionHash = HashToken(sessionID)
	if err := s.DB.QueryRowContext(ctx, `SELECT access_token, refresh_token, expires_at FROM core_grants WHERE session_id = ?`, g.SessionHash).Scan(&g.AccessToken, &g.RefreshToken, &exp); err != nil {
		return nil, notFound(err)
	}
	g.ExpiresAt, _ = time.Parse(time.RFC3339, exp)
	return &g, nil
}

// DeleteGrant forgets the Core tokens of a session (Core refused them).
func (s *Store) DeleteGrant(ctx context.Context, sessionID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM core_grants WHERE session_id = ?`, HashToken(sessionID))
	return err
}

// GetPrefs returns a person's launcher layout as raw JSON ({} when unset).
func (s *Store) GetPrefs(ctx context.Context, userID int64) json.RawMessage {
	var j string
	if err := s.DB.QueryRowContext(ctx, `SELECT json FROM user_prefs WHERE user_id = ?`, userID).Scan(&j); err != nil || j == "" {
		return json.RawMessage(`{}`)
	}
	return json.RawMessage(j)
}

// SetPrefs stores a person's launcher layout.
func (s *Store) SetPrefs(ctx context.Context, userID int64, j json.RawMessage) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO user_prefs (user_id, json, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`, userID, string(j), Now())
	return err
}
