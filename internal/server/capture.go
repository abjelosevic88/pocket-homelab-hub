package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

type captureInput struct {
	RequestID string `json:"request_id"`
	AppKey    string `json:"app_key"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Text      string `json:"text"`
	Due       string `json:"due"`
	Date      string `json:"date"`
}

var captureKey = regexp.MustCompile(`^[a-zA-Z0-9_-]{16,80}$`)

func (s *Server) handleCapture(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		writeErr(w, http.StatusUnsupportedMediaType, "Send JSON to capture an item.")
		return
	}
	var in captureInput
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "Invalid capture.")
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	in.Text = strings.TrimSpace(in.Text)
	if !captureKey.MatchString(in.RequestID) || utf8.RuneCountInString(in.Title) > 200 || utf8.RuneCountInString(in.Text) > 10000 {
		writeErr(w, 400, "Use a title up to 200 characters and text up to 10,000 characters.")
		return
	}
	if (in.Due != "" && !validDay(in.Due)) || (in.Date != "" && !validDay(in.Date)) {
		writeErr(w, 400, "Use dates in YYYY-MM-DD format.")
		return
	}
	kind, path := "", ""
	body := map[string]any{}
	switch in.Kind {
	case "task":
		if in.Title == "" {
			writeErr(w, 400, "Give your task a title.")
			return
		}
		kind, path = "tasks", "/tasks"
		body = map[string]any{"title": in.Title, "notes": in.Text}
		if in.Due != "" {
			body["due"] = in.Due
		}
	case "note":
		if in.Title == "" && in.Text == "" {
			writeErr(w, 400, "Write a title or some text for your note.")
			return
		}
		kind, path = "notes", "/notes"
		body = map[string]any{"title": in.Title, "content": in.Text}
	case "moment":
		if in.Text == "" {
			writeErr(w, 400, "Write a moment to keep.")
			return
		}
		kind, path = "day", "/moments"
		body = map[string]any{"text": in.Text, "kind": "note"}
		if in.Date != "" {
			body["date"] = in.Date
		}
	default:
		writeErr(w, 400, "Choose a task, note or journal moment.")
		return
	}
	apps, token, err := s.personalApps(r.Context(), principalFrom(r.Context()))
	if err != nil {
		writeErr(w, 503, "Your apps could not be connected. Nothing was sent.")
		return
	}
	var target *personalApp
	for i := range apps {
		if apps[i].Key == in.AppKey && apps[i].Kind == kind {
			target = &apps[i]
			break
		}
	}
	if target == nil {
		writeErr(w, 403, "This destination is no longer available in your profile.")
		return
	}
	uid := userFrom(r.Context()).ID
	normalized, _ := json.Marshal(in)
	sum := sha256.Sum256(normalized)
	digest := hex.EncodeToString(sum[:])
	result, err := s.store.DB.ExecContext(r.Context(), "INSERT INTO capture_requests(user_id,request_id,digest) VALUES(?,?,?) ON CONFLICT DO NOTHING", uid, in.RequestID, digest)
	if err != nil {
		s.fail(w, err, "reserve capture")
		return
	}
	inserted, _ := result.RowsAffected()
	if inserted == 0 {
		var savedDigest, receipt string
		var status int
		if err := s.store.DB.QueryRowContext(r.Context(), "SELECT digest,http_status,result FROM capture_requests WHERE user_id=? AND request_id=?", uid, in.RequestID).Scan(&savedDigest, &status, &receipt); err != nil {
			s.fail(w, err, "read capture")
			return
		}
		if savedDigest != digest {
			writeErr(w, 409, "This capture has changed. Start a new capture for different content.")
			return
		}
		if status == 0 {
			writeJSON(w, 409, map[string]any{"error": "This capture may already have reached the app. Check there before starting a new one.", "status": "unknown", "app_key": target.Key})
			return
		}
		writeJSON(w, status, json.RawMessage(receipt))
		return
	}
	// Finish and record the receipt even if the browser disconnects after sending.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 12*time.Second)
	defer cancel()
	var saved struct {
		ID int64 `json:"id"`
	}
	code, requestErr := personalRequest(ctx, *target, token, "POST", path, body, &saved)
	if requestErr == nil && saved.ID <= 0 {
		requestErr = errors.New("app did not return a record receipt")
	}
	status := http.StatusCreated
	receipt := map[string]any{"status": "saved", "app_key": target.Key, "kind": in.Kind, "id": saved.ID}
	if requestErr != nil {
		status = http.StatusBadGateway
		receipt = map[string]any{"status": "unknown", "app_key": target.Key, "error": "The app did not confirm this capture. Check it before creating another copy."}
		if code >= 400 && code < 500 {
			receipt["status"] = "failed"
			receipt["error"] = "The app refused this capture. Open the app to check your access and content."
		}
	}
	data, _ := json.Marshal(receipt)
	// Use an independent bounded context so an upstream timeout cannot lose a receipt.
	recordCtx, recordCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer recordCancel()
	if _, err := s.store.DB.ExecContext(recordCtx, "UPDATE capture_requests SET http_status=?,result=? WHERE user_id=? AND request_id=?", status, string(data), uid, in.RequestID); err != nil {
		s.log.Error("record capture receipt", "error", err)
		writeJSON(w, 502, map[string]any{"status": "unknown", "app_key": target.Key, "error": "Your capture may have been saved. Check the app before creating another copy."})
		return
	}
	writeJSON(w, status, receipt)
}
