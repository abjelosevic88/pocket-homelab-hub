package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
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
var captureWord = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,40}$`)

// captureDestination is one thing a quick line can become in one app. Kind
// stays the app's slug, as older clients read it; CaptureKind is the word to
// send back as "kind".
type captureDestination struct {
	personalApp
	CaptureKind string   `json:"capture_kind"`
	Label       string   `json:"label"`
	What        string   `json:"what,omitempty"`
	Fields      []string `json:"fields"`
}

// The hand-written captures: what a task, a note and a journal moment become
// in the three apps Hub has always known. They serve app versions that do not
// declare quick capture in their manifest.
type hardCapture struct {
	app, kind, label string
	fields           []string
}

var hardCaptures = []hardCapture{
	{"tasks", "task", "Task", []string{"title", "due"}},
	{"notes", "note", "Note", []string{"title"}},
	{"day", "moment", "Journal moment", []string{"date"}},
}

// hardCaptureFor finds the hand-written capture by the app's slug or, with an
// empty slug, by the word a client sends as "kind".
func hardCaptureFor(app, kind string) *hardCapture {
	for i := range hardCaptures {
		if (app == "" || hardCaptures[i].app == app) && (kind == "" || hardCaptures[i].kind == kind) {
			return &hardCaptures[i]
		}
	}
	return nil
}

// captureKinds are the kinds the app keeps through its Core link, tidied: a
// usable word, a label, only the fields Hub has an input for. None when the
// app offers no capture or the link is off for the person.
func captureKinds(app personalApp) []core.CaptureKind {
	if app.capture == nil || !app.captureLink.on {
		return nil
	}
	var out []core.CaptureKind
	seen := map[string]bool{}
	for _, k := range app.capture.Kinds {
		if !captureWord.MatchString(k.Kind) || seen[k.Kind] {
			continue
		}
		seen[k.Kind] = true
		clean := core.CaptureKind{Kind: k.Kind, Label: oneLine(k.Label, 40), What: oneLine(k.What, 200), Fields: []string{}}
		if clean.Label == "" {
			word := strings.NewReplacer("-", " ", "_", " ").Replace(k.Kind)
			clean.Label = strings.ToUpper(word[:1]) + word[1:]
		}
		for _, f := range []string{"title", "due", "date"} {
			for _, have := range k.Fields {
				if have == f {
					clean.Fields = append(clean.Fields, f)
					break
				}
			}
		}
		if out = append(out, clean); len(out) == 12 {
			break
		}
	}
	return out
}

// destinationsOf lists where a quick line can go: every kind an app keeps
// through its Core link, or the hand-written one for a first-party app without
// such a link. An app whose link is off is simply not offered.
func destinationsOf(apps []personalApp) []captureDestination {
	out := []captureDestination{}
	for _, app := range apps {
		kinds := captureKinds(app)
		if len(kinds) == 0 {
			if h := hardCaptureFor(app.Kind, ""); h != nil && app.URL != "" {
				out = append(out, captureDestination{personalApp: app, CaptureKind: h.kind, Label: h.label, Fields: h.fields})
			}
			continue
		}
		for _, k := range kinds {
			out = append(out, captureDestination{personalApp: app, CaptureKind: k.Kind, Label: k.Label, What: k.What, Fields: k.Fields})
		}
	}
	return out
}

// hardCaptureRequest is the app's own route and body for a hand-written
// capture, or the sentence that says what is missing.
func hardCaptureRequest(in captureInput) (path string, body map[string]any, problem string) {
	switch in.Kind {
	case "task":
		if in.Title == "" {
			return "", nil, "Give your task a title."
		}
		body = map[string]any{"title": in.Title, "notes": in.Text}
		if in.Due != "" {
			body["due"] = in.Due
		}
		return "/tasks", body, ""
	case "note":
		if in.Title == "" && in.Text == "" {
			return "", nil, "Write a title or some text for your note."
		}
		return "/notes", map[string]any{"title": in.Title, "content": in.Text}, ""
	case "moment":
		if in.Text == "" {
			return "", nil, "Write a moment to keep."
		}
		body = map[string]any{"text": in.Text, "kind": "note"}
		if in.Date != "" {
			body["date"] = in.Date
		}
		return "/moments", body, ""
	}
	return "", nil, "Choose a task, note or journal moment."
}

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
	in.Kind = strings.TrimSpace(in.Kind)
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
	if !captureWord.MatchString(in.Kind) {
		writeErr(w, 400, "Choose what you want to add.")
		return
	}
	p := principalFrom(r.Context())
	apps, token, err := s.personalApps(r.Context(), p)
	if err != nil {
		writeErr(w, 503, "Your apps could not be connected. Nothing was sent.")
		return
	}
	var target *personalApp
	for i := range apps {
		if apps[i].Key == in.AppKey {
			target = &apps[i]
			break
		}
	}
	if target == nil {
		writeErr(w, 403, "This destination is no longer available in your profile.")
		return
	}
	// A kind the app keeps through its Core link goes there with a link token.
	// A task, a note and a journal moment also keep their hand-written route
	// (the person's own token, Tasks, Notes and Day only), for when the app
	// offers no capture or its link is off.
	var declared *core.CaptureKind
	kinds := captureKinds(*target)
	for i := range kinds {
		if kinds[i].Kind == in.Kind {
			declared = &kinds[i]
		}
	}
	hard := hardCaptureFor(target.Kind, in.Kind)
	if target.URL == "" {
		hard = nil // not at the address Core has for it: the person's token stays here
	}
	if declared == nil && hard == nil {
		switch {
		case target.capture != nil && !target.captureLink.on:
			writeErr(w, 403, linkOffSentence(target.captureLink.state))
		case len(kinds) > 0:
			writeErr(w, 400, target.Name+" does not keep that. Choose one of the things it offers.")
		case hardCaptureFor("", in.Kind) != nil:
			writeErr(w, 403, "This destination is no longer available in your profile.")
		default:
			writeErr(w, 400, "Choose a task, note or journal moment.")
		}
		return
	}
	contract := declared != nil
	var hardPath string
	var hardBody map[string]any
	if hard != nil {
		var problem string
		if hardPath, hardBody, problem = hardCaptureRequest(in); problem != "" {
			if !contract {
				writeErr(w, 400, problem)
				return
			}
			hard = nil // the hand-written route cannot take this content: no fallback
		}
	}
	var send core.CaptureInput
	if contract {
		send = core.CaptureInput{RequestID: in.RequestID, Kind: declared.Kind, Text: in.Text}
		for _, f := range declared.Fields {
			switch f {
			case "title":
				send.Title = in.Title
			case "due":
				send.Due = in.Due
			case "date":
				send.Date = in.Date
			}
		}
		if send.Title == "" && send.Text == "" {
			writeErr(w, 400, "Write something first.")
			return
		}
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
	var status int
	var receipt map[string]any
	if contract {
		saved, requestErr := s.core.CaptureIn(ctx, p.user.Email, target.Kind, send)
		var off *core.LinkError
		if errors.As(requestErr, &off) {
			s.forgetCapable(p.user.Email)
		}
		if requestErr != nil && hard != nil && useHardWired(requestErr) {
			// Core has just refused the link, or the app that runs does not
			// serve the route yet: nothing was kept, so its own route is used.
			contract = false
		} else {
			status, receipt = contractReceipt(*target, in.Kind, saved, requestErr)
		}
	}
	if !contract {
		var saved struct {
			ID int64 `json:"id"`
		}
		code, requestErr := personalRequest(ctx, *target, token, "POST", hardPath, hardBody, &saved)
		if requestErr == nil && saved.ID <= 0 {
			requestErr = errors.New("app did not return a record receipt")
		}
		status, receipt = http.StatusCreated, map[string]any{"status": "saved", "app_key": target.Key, "kind": in.Kind, "id": saved.ID}
		if requestErr != nil {
			status, receipt = unconfirmedReceipt(*target, code)
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

// unconfirmedReceipt is what the person hears when the app did not say "saved".
func unconfirmedReceipt(target personalApp, code int) (int, map[string]any) {
	receipt := map[string]any{"status": "unknown", "app_key": target.Key, "error": "The app did not confirm this capture. Check it before creating another copy."}
	if code >= 400 && code < 500 {
		receipt["status"] = "failed"
		receipt["error"] = "The app refused this capture. Open the app to check your access and content."
	}
	return http.StatusBadGateway, receipt
}

// contractReceipt reads the app's answer to a capture sent through a Core
// link. "id" stays a number for older clients (0 when the app's id is not
// one); item_id is the app's own id as text and url opens the new item.
func contractReceipt(target personalApp, kind string, saved *core.CaptureResult, requestErr error) (int, map[string]any) {
	var off *core.LinkError
	var refused *core.CapabilityError
	switch {
	case errors.As(requestErr, &off):
		// Core gave no token, so nothing reached the app.
		return http.StatusBadGateway, map[string]any{"status": "failed", "app_key": target.Key, "error": linkOffSentence(off.Reason)}
	case errors.As(requestErr, &refused):
		// 400 is the app telling the person what to fix, in its own words.
		if sentence := oneLine(refused.Message, 300); refused.Status == http.StatusBadRequest && sentence != "" && sentence != http.StatusText(http.StatusBadRequest) {
			return http.StatusBadRequest, map[string]any{"status": "failed", "app_key": target.Key, "error": sentence}
		}
		return unconfirmedReceipt(target, refused.Status)
	case requestErr != nil || saved == nil || strings.TrimSpace(saved.ID) == "":
		return unconfirmedReceipt(target, 0)
	}
	id, err := strconv.ParseInt(saved.ID, 10, 64)
	if err != nil || id < 0 {
		id = 0
	}
	receipt := map[string]any{"status": "saved", "app_key": target.Key, "kind": kind, "id": id, "item_id": oneLine(saved.ID, 100)}
	if title := oneLine(saved.Title, 200); title != "" {
		receipt["title"] = title
	}
	if link := appLink(target.public, saved.URL); link != "" {
		receipt["url"] = link
	}
	return http.StatusCreated, receipt
}
