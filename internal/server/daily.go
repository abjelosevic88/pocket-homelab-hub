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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
)

// Hub talks to an app as the person, with the person's own Core token. It does
// so only for a Pocket app that is on the person's list and registered with
// Core at exactly that address, and only when the app either declares a widget
// or quick capture in its manifest (Core docs/capabilities.md) or is one of the
// first-party apps below.
var personalAppHTTP = &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}

// The apps Hub has a hand-written adapter for. They stay as the fallback for
// app versions that do not declare the capability yet.
var personalKinds = []string{"tasks", "habits", "kitchen", "notes", "day"}

const (
	// maxDailySources is how many apps one /daily request asks. The rest are
	// listed under "more" and asked once the person puts their widget on Home.
	maxDailySources = 24
	// maxWidgetItems is the contract's own limit for a widget's rows.
	maxWidgetItems = 8
	// contractRetry is how long Hub keeps to the hand-written adapter after a
	// first-party app answered 404/405 on the contract route (an older version).
	contractRetry = 10 * time.Minute
)

type personalApp struct {
	Key  string `json:"app_key"`
	Kind string `json:"kind"` // the app's slug in Core
	Name string `json:"name"`
	Icon string `json:"icon,omitempty"`
	URL  string `json:"-"`
	// What the app declared in its manifest; nil when it did not.
	widget  *core.Widget
	capture *core.QuickCapture
}

// dailyItem keeps the numeric id older clients read; Ref is the app's own id
// as text (the contract's ids are text). An id that is not a whole number
// becomes a negative position, so rows still differ.
type dailyItem struct {
	ID     int64  `json:"id"`
	Ref    string `json:"ref,omitempty"`
	Title  string `json:"title"`
	Detail string `json:"detail,omitempty"`
	Done   bool   `json:"done,omitempty"`
	URL    string `json:"url,omitempty"`
}
type dailyMetric struct {
	Label string `json:"label"`
	Value int    `json:"value"`
}

// dailyFigure is a metric as the app worded it ("4 of 6"). Metrics carries
// only the whole numbers among them, in the shape older clients read.
type dailyFigure struct {
	Label string `json:"label"`
	Value string `json:"value"`
}
type dailySource struct {
	personalApp
	Title   string        `json:"title,omitempty"` // the widget's title from the manifest
	What    string        `json:"what,omitempty"`  // what it shows, from the manifest
	State   string        `json:"state"`
	Message string        `json:"message,omitempty"`
	Line    string        `json:"line,omitempty"`
	Items   []dailyItem   `json:"items"`
	Metrics []dailyMetric `json:"metrics"`
	Figures []dailyFigure `json:"figures"`
	Open    string        `json:"url,omitempty"` // the place in the app the widget is about
}

// dailyOffer is an app with a widget that this request did not ask.
type dailyOffer struct {
	personalApp
	Title string `json:"title,omitempty"`
	What  string `json:"what,omitempty"`
}

func hardWired(kind string) int {
	for i, k := range personalKinds {
		if k == kind {
			return i
		}
	}
	return -1
}

// hardSource reports whether the hand-written adapters can read the app's day.
func hardSource(kind string) bool { return hardWired(kind) >= 0 && kind != "day" }

func (a personalApp) source() bool { return a.widget != nil || hardSource(a.Kind) }

// oneLine folds whitespace and cuts to max characters.
func oneLine(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > max {
		s = strings.TrimSpace(string(r[:max-1])) + "…"
	}
	return s
}

// appLink turns an address an app sent into one a browser can open, and keeps
// it inside that app: a path is joined to the app's address, a full address is
// kept only when it is the app's own.
func appLink(app personalApp, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 2000 {
		return ""
	}
	base, err := url.Parse(app.URL)
	if err != nil {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if u.Scheme == "" && u.Host == "" {
		if u, err = url.Parse(app.URL + "/" + strings.TrimLeft(raw, "/")); err != nil {
			return ""
		}
	}
	if u.Scheme != base.Scheme || u.Host != base.Host || u.User != nil {
		return ""
	}
	if u.Path != base.Path && !strings.HasPrefix(u.Path, strings.TrimRight(base.Path, "/")+"/") {
		return ""
	}
	return u.String()
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
	registry := map[string]coreApp{}
	for _, app := range apps {
		registry[app.Slug] = app
	}
	out := []personalApp{}
	for _, sv := range services {
		if !sv.Pocket || sv.Type == "hub" {
			continue
		}
		// The person's token only goes to the address Core has for the app.
		target := approvedAppURL(sv.URL)
		reg, ok := registry[sv.Type]
		if target == "" || !ok || target != approvedAppURL(reg.PublicURL) {
			continue
		}
		app := personalApp{Key: fmt.Sprintf("%s-%d", sv.Type, sv.ID), Kind: sv.Type, Name: sv.Name, Icon: sv.Icon, URL: target, widget: reg.Manifest.Widget}
		if c := reg.Manifest.Capture; c != nil && len(c.Kinds) > 0 {
			app.capture = c
		}
		if hardWired(app.Kind) < 0 && app.widget == nil && app.capture == nil {
			continue
		}
		out = append(out, app)
	}
	// The apps Hub has always known first, in their old order; the rest by name.
	sort.SliceStable(out, func(i, j int) bool {
		ri, rj := hardWired(out[i].Kind), hardWired(out[j].Kind)
		if ri < 0 && rj < 0 {
			return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
		}
		if ri < 0 || rj < 0 {
			return rj < 0
		}
		return ri < rj
	})
	return out, token, nil
}

// personalDo makes one request to the app as the person. It returns the status
// and the body; anything but a 2xx is an error, with the body kept so a
// refusal's own words can be read.
func personalDo(ctx context.Context, app personalApp, token, method, path string, payload any) (int, []byte, error) {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, app.URL+path, body)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Pocket-Source", "hub")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := personalAppHTTP.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
		return res.StatusCode, data, errors.New("app request refused")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return res.StatusCode, nil, errors.New("app response could not be read")
	}
	return res.StatusCode, data, nil
}

func personalRequest(ctx context.Context, app personalApp, token, method, path string, payload any, out any) (int, error) {
	status, data, err := personalDo(ctx, app, token, method, "/api/v1"+path, payload)
	if err != nil {
		return status, err
	}
	if out != nil {
		if err := json.Unmarshal(data, out); err != nil {
			return status, errors.New("app response format is not supported")
		}
	}
	return status, nil
}

func validDay(date string) bool {
	d, err := time.Parse("2006-01-02", date)
	return err == nil && d.Format("2006-01-02") == date
}

// pickSources chooses which apps this request asks: the ones the person has on
// Home (want) first, then the apps Hub has always shown, then the rest by
// name, up to maxDailySources. Both lists keep the apps' usual order.
func pickSources(apps []personalApp, want map[string]bool) (ask, rest []personalApp) {
	var candidates []personalApp
	for _, app := range apps {
		if app.source() {
			candidates = append(candidates, app)
		}
	}
	rank := func(app personalApp) int {
		switch {
		case want[app.Key]:
			return 0
		case hardSource(app.Kind):
			return 1
		}
		return 2
	}
	order := make([]int, len(candidates))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(i, j int) bool { return rank(candidates[order[i]]) < rank(candidates[order[j]]) })
	chosen := map[int]bool{}
	for _, i := range order {
		if len(chosen) == maxDailySources {
			break
		}
		chosen[i] = true
	}
	for i, app := range candidates {
		if chosen[i] {
			ask = append(ask, app)
		} else {
			rest = append(rest, app)
		}
	}
	return ask, rest
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
	// want: the apps whose widget the person keeps on Home (app keys, comma separated).
	want := map[string]bool{}
	for _, key := range strings.Split(r.URL.Query().Get("want"), ",") {
		if key = strings.TrimSpace(key); key != "" && len(want) < maxDailySources {
			want[key] = true
		}
	}
	ask, rest := pickSources(apps, want)
	sources := []dailySource{}
	for _, app := range ask {
		src := dailySource{personalApp: app, State: "ready", Items: []dailyItem{}, Metrics: []dailyMetric{}, Figures: []dailyFigure{}}
		src.Title, src.What = widgetWords(app)
		sources = append(sources, src)
	}
	more := []dailyOffer{}
	for _, app := range rest {
		offer := dailyOffer{personalApp: app}
		offer.Title, offer.What = widgetWords(app)
		more = append(more, offer)
	}
	var wg sync.WaitGroup
	for i := range sources {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
			defer cancel()
			if err := s.loadSource(ctx, &sources[i], token, date); err != nil {
				sources[i].State = "unavailable"
				sources[i].Message = "This app couldn’t be refreshed. Open it or try again shortly."
				sources[i].Line, sources[i].Open = "", ""
				sources[i].Items = []dailyItem{}
				sources[i].Metrics = []dailyMetric{}
				sources[i].Figures = []dailyFigure{}
			}
		}(i)
	}
	wg.Wait()
	writeJSON(w, http.StatusOK, map[string]any{"date": date, "sources": sources, "more": more, "destinations": destinationsOf(apps), "refreshed_at": time.Now().UTC().Format(time.RFC3339)})
}

// widgetWords are the title and the description the app gave its widget.
func widgetWords(app personalApp) (title, what string) {
	if app.widget == nil {
		return "", ""
	}
	return oneLine(app.widget.Title, 80), oneLine(app.widget.What, 200)
}

func contractAbsent(status int) bool {
	return status == http.StatusNotFound || status == http.StatusMethodNotAllowed
}

// contractMissing reports whether the app answered 404/405 on a contract
// route a little while ago: its manifest names the capability, the version
// that runs does not serve it yet.
func (s *Server) contractMissing(app personalApp, capability string) bool {
	at, ok := s.absent.Load(capability + " " + app.URL)
	return ok && time.Since(at.(time.Time)) < contractRetry
}

func (s *Server) rememberContractMissing(app personalApp, capability string) {
	s.absent.Store(capability+" "+app.URL, time.Now())
}

// loadSource fills one app's part of the day: from the widget route when the
// app declares one, else with the hand-written adapter. An app Hub has an
// adapter for falls back to it when the widget route is not there (404/405).
func (s *Server) loadSource(ctx context.Context, dst *dailySource, token, date string) error {
	app := dst.personalApp
	hard := hardSource(app.Kind)
	if app.widget != nil && !(hard && s.contractMissing(app, "widget")) {
		status, err := loadWidget(ctx, dst, token)
		if err == nil || !hard || !contractAbsent(status) {
			return err
		}
		s.rememberContractMissing(app, "widget")
	}
	if !hard {
		return errors.New("the app has no widget")
	}
	if err := loadDailySource(ctx, dst, token, date); err != nil {
		return err
	}
	for _, m := range dst.Metrics {
		dst.Figures = append(dst.Figures, dailyFigure{Label: m.Label, Value: strconv.Itoa(m.Value)})
	}
	return nil
}

// loadWidget reads the app's widget (GET /api/v1/pocket/widget) as the person
// and puts it in the shape /daily has always had.
func loadWidget(ctx context.Context, dst *dailySource, token string) (int, error) {
	app := dst.personalApp
	status, body, err := personalDo(ctx, app, token, http.MethodGet, core.WidgetPath, nil)
	if err != nil {
		return status, err
	}
	// An answer without "items" is something else than a widget; never show it as an empty one.
	var keys map[string]json.RawMessage
	var data core.WidgetData
	if json.Unmarshal(body, &keys) != nil || keys["items"] == nil || json.Unmarshal(body, &data) != nil {
		return status, errors.New("app response format is not supported")
	}
	dst.Line = oneLine(data.Line, 200)
	dst.Open = appLink(app, data.URL)
	for _, m := range data.Metrics {
		label, value := oneLine(m.Label, 40), oneLine(m.Value, 40)
		if label == "" || value == "" {
			continue
		}
		dst.Figures = append(dst.Figures, dailyFigure{Label: label, Value: value})
		if n, err := strconv.Atoi(value); err == nil {
			dst.Metrics = append(dst.Metrics, dailyMetric{Label: label, Value: n})
		}
		if len(dst.Figures) == 4 {
			break
		}
	}
	for _, it := range data.Items {
		title := oneLine(it.Title, 200)
		if title == "" {
			continue
		}
		id, err := strconv.ParseInt(it.ID, 10, 64)
		if err != nil || id <= 0 {
			id = -int64(len(dst.Items) + 1)
		}
		dst.Items = append(dst.Items, dailyItem{ID: id, Ref: oneLine(it.ID, 100), Title: title, Detail: oneLine(it.Detail, 200), Done: it.Done, URL: appLink(app, it.URL)})
		if len(dst.Items) == maxWidgetItems {
			break
		}
	}
	return status, nil
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
