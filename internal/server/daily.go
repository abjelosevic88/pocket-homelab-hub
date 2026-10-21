package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Only these first-party adapters may receive the person's Core token. A
// destination must also match both the current audience and app registry.
var personalAppHTTP = &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
var personalKinds = []string{"tasks", "habits", "kitchen", "notes", "day"}

type personalApp struct {
	Key  string `json:"app_key"`
	Kind string `json:"kind"`
	Name string `json:"name"`
	URL  string `json:"-"`
}
type dailyItem struct {
	ID     int64  `json:"id"`
	Title  string `json:"title"`
	Detail string `json:"detail,omitempty"`
	Done   bool   `json:"done,omitempty"`
}
type dailyMetric struct {
	Label string `json:"label"`
	Value int    `json:"value"`
}
type dailySource struct {
	personalApp
	State   string        `json:"state"`
	Message string        `json:"message,omitempty"`
	Items   []dailyItem   `json:"items"`
	Metrics []dailyMetric `json:"metrics"`
}

func approvedAppURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return ""
	}
	// Plain HTTP is allowed only on loopback for local development/test servers.
	if u.Scheme != "https" && !(u.Scheme == "http" && net.ParseIP(u.Hostname()).IsLoopback()) {
		return ""
	}
	return strings.TrimRight(u.String(), "/")
}

func (s *Server) personalApps(ctx context.Context, p *principal) ([]personalApp, string, error) {
	token, err := s.userCoreToken(ctx, p)
	if err != nil {
		return nil, "", err
	}
	// Fresh registry and audience checks: a revoked or moved app is not contacted.
	var services []coreService
	if _, err := s.coreGet(ctx, "/api/v1/me/services", token, &services); err != nil {
		return nil, "", err
	}
	var apps []coreApp
	if _, err := s.coreGet(ctx, "/api/v1/apps", s.core.Token(), &apps); err != nil {
		return nil, "", err
	}
	out := []personalApp{}
	for _, kind := range personalKinds {
		for _, sv := range services {
			if !sv.Pocket || sv.Type != kind {
				continue
			}
			target := approvedAppURL(sv.URL)
			if target == "" {
				continue
			}
			for _, app := range apps {
				if app.Slug == kind && target == approvedAppURL(app.PublicURL) {
					out = append(out, personalApp{Key: fmt.Sprintf("%s-%d", sv.Type, sv.ID), Kind: kind, Name: sv.Name, URL: target})
					break
				}
			}
		}
	}
	return out, token, nil
}

func personalRequest(ctx context.Context, app personalApp, token, method, path string, payload any, out any) (int, error) {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return 0, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, app.URL+"/api/v1"+path, body)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Pocket-Source", "hub")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := personalAppHTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return res.StatusCode, errors.New("app request refused")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return res.StatusCode, errors.New("app response could not be read")
	}
	if out != nil {
		if err := json.Unmarshal(data, out); err != nil {
			return res.StatusCode, errors.New("app response format is not supported")
		}
	}
	return res.StatusCode, nil
}

func validDay(date string) bool {
	d, err := time.Parse("2006-01-02", date)
	return err == nil && d.Format("2006-01-02") == date
}

func (s *Server) handleDaily(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if !validDay(date) {
		writeErr(w, http.StatusBadRequest, "Use a date in YYYY-MM-DD format.")
		return
	}
	apps, token, err := s.personalApps(r.Context(), principalFrom(r.Context()))
	if err != nil {
		writeErr(w, http.StatusServiceUnavailable, "Your apps could not be connected. Try refreshing or signing in again.")
		return
	}
	sources := []dailySource{}
	destinations := []personalApp{}
	for _, app := range apps {
		if app.Kind == "tasks" || app.Kind == "notes" || app.Kind == "day" {
			destinations = append(destinations, app)
		}
		if app.Kind != "day" {
			sources = append(sources, dailySource{personalApp: app, State: "ready", Items: []dailyItem{}, Metrics: []dailyMetric{}})
		}
	}
	var wg sync.WaitGroup
	for i := range sources {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
			defer cancel()
			if err := loadDailySource(ctx, &sources[i], token, date); err != nil {
				sources[i].State = "unavailable"
				sources[i].Message = "This app couldn’t be refreshed. Open it or try again shortly."
				sources[i].Items = []dailyItem{}
				sources[i].Metrics = []dailyMetric{}
			}
		}(i)
	}
	wg.Wait()
	writeJSON(w, http.StatusOK, map[string]any{"date": date, "sources": sources, "destinations": destinations, "refreshed_at": time.Now().UTC().Format(time.RFC3339)})
}

func loadDailySource(ctx context.Context, dst *dailySource, token, date string) error {
	switch dst.Kind {
	case "tasks":
		var out struct {
			Today     *int `json:"today"`
			Overdue   *int `json:"overdue"`
			DoneToday *int `json:"done_today"`
			Next      []struct {
				ID    int64   `json:"id"`
				Title string  `json:"title"`
				Due   *string `json:"due"`
			} `json:"next"`
		}
		if _, err := personalRequest(ctx, dst.personalApp, token, "GET", "/dashboard", nil, &out); err != nil {
			return err
		}
		if out.Today == nil || out.Overdue == nil || out.DoneToday == nil {
			return errors.New("incomplete task summary")
		}
		dst.Message = "Dates follow your Tasks time zone."
		dst.Metrics = []dailyMetric{{"Today", *out.Today}, {"Overdue", *out.Overdue}, {"Finished today", *out.DoneToday}}
		for _, item := range out.Next {
			detail := ""
			if item.Due != nil {
				detail = *item.Due
			}
			dst.Items = append(dst.Items, dailyItem{ID: item.ID, Title: item.Title, Detail: detail})
		}
	case "habits":
		var out struct {
			Done   *int `json:"done"`
			Total  *int `json:"total"`
			Habits []struct {
				ID        int64  `json:"id"`
				Name      string `json:"name"`
				Status    int    `json:"status"`
				Scheduled bool   `json:"scheduled"`
				Streak    int    `json:"streak"`
			} `json:"habits"`
		}
		if _, err := personalRequest(ctx, dst.personalApp, token, "GET", "/days/"+date, nil, &out); err != nil {
			return err
		}
		if out.Done == nil || out.Total == nil {
			return errors.New("incomplete habit summary")
		}
		dst.Metrics = []dailyMetric{{"Done", *out.Done}, {"Scheduled", *out.Total}}
		for _, item := range out.Habits {
			if item.Scheduled {
				detail := "Not checked in"
				if item.Status == 1 {
					detail = "Done"
				} else if item.Status == -1 {
					detail = "Missed"
				}
				dst.Items = append(dst.Items, dailyItem{ID: item.ID, Title: item.Name, Detail: detail, Done: item.Status == 1})
			}
		}
	case "kitchen":
		var out struct {
			Entries []struct {
				ID          int64  `json:"id"`
				Title       string `json:"title"`
				RecipeTitle string `json:"recipe_title"`
				Slot        string `json:"slot"`
				CookedAt    string `json:"cooked_at"`
			} `json:"entries"`
		}
		if _, err := personalRequest(ctx, dst.personalApp, token, "GET", "/plan?from="+date+"&to="+date, nil, &out); err != nil {
			return err
		}
		if out.Entries == nil {
			return errors.New("incomplete meal plan")
		}
		dst.Metrics = []dailyMetric{{"Planned meals", len(out.Entries)}}
		for _, item := range out.Entries {
			dst.Items = append(dst.Items, dailyItem{ID: item.ID, Title: firstNonEmpty(item.RecipeTitle, item.Title, "Untitled meal"), Detail: item.Slot, Done: item.CookedAt != ""})
		}
	case "notes":
		var out []struct {
			ID       int64  `json:"id"`
			Title    string `json:"title"`
			Category string `json:"category"`
			Modified int64  `json:"modified"`
		}
		if _, err := personalRequest(ctx, dst.personalApp, token, "GET", "/notes?sort=modified&limit=6", nil, &out); err != nil {
			return err
		}
		for _, item := range out {
			dst.Items = append(dst.Items, dailyItem{ID: item.ID, Title: firstNonEmpty(item.Title, "Untitled note"), Detail: firstNonEmpty(item.Category, "Notes")})
		}
	}
	if len(dst.Items) > 6 {
		dst.Items = dst.Items[:6]
	}
	return nil
}
