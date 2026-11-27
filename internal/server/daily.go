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

// Hub reaches a person's apps in two ways, and never mixes them.
//
// Any app that offers a widget or quick capture (Core docs/capabilities.md) is
// reached through a Core link: Hub declares "every app" rules for the two
// scopes, asks Core who offers them for this person (Capable) and calls the app
// with a link token that works only in that app, for that one route, for a few
// minutes (WidgetIn, CaptureIn).
//
// The five first-party apps below also have a hand-written adapter that calls
// the app with the person's own Core token. That token goes only to those
// apps, only on their old routes, and only at the address the person's list and
// Core's registry agree on. It is never sent to a capability route.
var personalAppHTTP = &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
var personalKinds = []string{"tasks", "habits", "kitchen", "notes", "day"}

const (
	// maxDailySources is how many apps one /daily request asks. The rest are
	// listed under "more" and asked once the person puts their widget on Home.
	maxDailySources = 24
	// maxWidgetItems is the contract's own limit for a widget's rows.
	maxWidgetItems = 8
	// capableTTL is how long Hub remembers who offers a capability to a person.
	// A link switched off still stops the very next call: tokens are never kept.
	capableTTL = 45 * time.Second
	// capableMax bounds that memory (people × two scopes).
	capableMax = 512
)

type personalApp struct {
	Key  string `json:"app_key"` // "<type>-<id>" of the person's launcher entry, or the slug for an app that is not on their list
	Kind string `json:"kind"`    // the app's slug in Core
	Name string `json:"name"`
	Icon string `json:"icon,omitempty"`
	// AppURL is where a browser opens an app that is linked for the person
	// but not on their launcher list; empty when the list has it.
	AppURL string `json:"app_url,omitempty"`
	// URL is the address the hand-written adapters call with the person's own
	// token. It is set only for the first-party apps that passed the address check.
	URL string `json:"-"`
	// public is the address of the app as Core has it; addresses the app sends must be inside it.
	public string
	// What the app offers through Core links, and how each link stands for the person.
	widget      *core.Widget
	widgetLink  linkStand
	capture     *core.QuickCapture
	captureLink linkStand
}

// linkStand is one Core link for one person: on, or the reason it is not.
type linkStand struct {
	on    bool
	state string
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

// dailyOffer is an app with a widget that this request did not ask: it waits
// its turn (Off empty), or Core does not let Hub read it for this person (Off
// says why, in a sentence).
type dailyOffer struct {
	personalApp
	Title string `json:"title,omitempty"`
	What  string `json:"what,omitempty"`
	Off   string `json:"off,omitempty"`
}

func hardWired(kind string) int {
	for i, k := range personalKinds {
		if k == kind {
			return i
		}
	}
	return -1
}

// hardSource reports whether a hand-written adapter can read the app's day.
func (a personalApp) hardSource() bool {
	return a.URL != "" && hardWired(a.Kind) >= 0 && a.Kind != "day"
}

// linkedWidget reports whether the app's widget can be read through a Core link now.
func (a personalApp) linkedWidget() bool { return a.widget != nil && a.widgetLink.on }

func (a personalApp) source() bool { return a.linkedWidget() || a.hardSource() }

// linkOffSentence says why Core does not let Hub act in an app for the person.
func linkOffSentence(state string) string {
	switch state {
	case "off_person":
		return "You switched this off in Pocket Core. You can switch it back on there, in Settings under Apps acting for me."
	case "off_admin":
		return "Not allowed in Pocket Core yet. The person who looks after your box can switch it on there, under Links."
	case "not_in_audience":
		return "This app is not on your list in Pocket Core."
	}
	return "Pocket Core does not let Pocket Hub use this app for you right now."
}

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
func appLink(appURL, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 2000 {
		return ""
	}
	base, err := url.Parse(appURL)
	if err != nil || base.Host == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if u.Scheme == "" && u.Host == "" {
		if u, err = url.Parse(strings.TrimRight(appURL, "/") + "/" + strings.TrimLeft(raw, "/")); err != nil {
			return ""
		}
	}
	if u.Scheme != base.Scheme || u.Host != base.Host || u.User != nil {
		return ""
	}
	if root := strings.TrimRight(base.Path, "/"); u.Path != root && !strings.HasPrefix(u.Path, root+"/") {
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

// capable asks Core which apps offer a capability to this person and how the
// link to each stands, and remembers the answer for a short while. No Core, an
// older Core or a failure means: nobody.
func (s *Server) capable(ctx context.Context, email, scope string) []core.CapableApp {
	if email == "" || !s.core.Configured() || s.core.Token() == "" {
		return nil
	}
	type entry struct {
		apps []core.CapableApp
		at   time.Time
	}
	key := scope + " " + strings.ToLower(email)
	s.capableMu.Lock()
	e, ok := s.capableSeen[key].(entry)
	s.capableMu.Unlock()
	if ok && time.Since(e.at) < capableTTL {
		return e.apps
	}
	apps, err := s.core.Capable(ctx, email, scope)
	if err != nil {
		s.log.Debug("pocket core: who offers "+scope, "err", err)
		return nil
	}
	s.capableMu.Lock()
	defer s.capableMu.Unlock()
	if len(s.capableSeen) >= capableMax {
		for k, v := range s.capableSeen {
			if time.Since(v.(entry).at) >= capableTTL {
				delete(s.capableSeen, k)
			}
		}
		if len(s.capableSeen) >= capableMax {
			s.capableSeen = map[string]any{}
		}
	}
	s.capableSeen[key] = entry{apps: apps, at: time.Now()}
	return apps
}

// forgetCapable drops what Hub remembers about a person's links, after Core
// refused one that was on a moment ago.
func (s *Server) forgetCapable(email string) {
	s.capableMu.Lock()
	defer s.capableMu.Unlock()
	for _, scope := range []string{core.ScopeWidget, core.ScopeCapture} {
		delete(s.capableSeen, scope+" "+strings.ToLower(email))
	}
}

// personalApps lists the apps Hub may talk to for this person, and returns the
// person's own Core token for the hand-written adapters.
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
	at := map[string]int{} // slug → index in out
	// The first-party apps, for the hand-written adapters: on the person's list,
	// and registered with Core at exactly that address.
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
					if _, dup := at[kind]; !dup {
						at[kind] = len(out)
					}
					out = append(out, personalApp{Key: fmt.Sprintf("%s-%d", sv.Type, sv.ID), Kind: kind, Name: sv.Name, Icon: sv.Icon, URL: target, public: target})
					break
				}
			}
		}
	}
	// Every app that offers a widget or quick capture through a Core link. The
	// person's Core email names them; a session without one has no such apps.
	email := p.user.Email
	linked := func(a core.CapableApp) *personalApp {
		if i, ok := at[a.App]; ok {
			return &out[i]
		}
		app := personalApp{Key: a.App, Kind: a.App, Name: firstNonEmpty(a.Name, a.App), Icon: a.Icon, public: strings.TrimRight(firstNonEmpty(a.PublicURL, a.URL), "/")}
		app.AppURL = app.public
		for _, sv := range services {
			if sv.Pocket && sv.Type == a.App {
				app.Key, app.Name, app.AppURL = fmt.Sprintf("%s-%d", sv.Type, sv.ID), firstNonEmpty(sv.Name, app.Name), ""
				app.Icon = firstNonEmpty(sv.Icon, app.Icon)
				break
			}
		}
		at[a.App] = len(out)
		out = append(out, app)
		return &out[len(out)-1]
	}
	// An app whose link is off is kept only when a switch in Core is the
	// reason, so its empty widget can say so; an app the person may not use at
	// all is not mentioned.
	shown := func(a core.CapableApp) bool {
		return a.App != "hub" && (a.On || a.State == "off_admin" || a.State == "off_person")
	}
	for _, a := range s.capable(ctx, email, core.ScopeWidget) {
		if !shown(a) || a.Widget == nil {
			continue
		}
		app := linked(a)
		app.widget, app.widgetLink = a.Widget, linkStand{on: a.On, state: a.State}
	}
	for _, a := range s.capable(ctx, email, core.ScopeCapture) {
		if !shown(a) || a.Capture == nil || len(a.Capture.Kinds) == 0 {
			continue
		}
		app := linked(a)
		app.capture, app.captureLink = a.Capture, linkStand{on: a.On, state: a.State}
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
		case app.hardSource():
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
	p := principalFrom(r.Context())
	apps, token, err := s.personalApps(r.Context(), p)
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
	// An app that has a widget Core does not let Hub read for this person is
	// not asked; it is listed with the reason, so an empty widget explains itself.
	for _, app := range apps {
		if app.widget != nil && !app.source() {
			offer := dailyOffer{personalApp: app, Off: linkOffSentence(app.widgetLink.state)}
			offer.Title, offer.What = widgetWords(app)
			more = append(more, offer)
		}
	}
	var wg sync.WaitGroup
	for i := range sources {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
			defer cancel()
			if err := s.loadSource(ctx, &sources[i], p.user.Email, token, date); err != nil {
				sources[i].State = "unavailable"
				sources[i].Message = "This app couldn’t be refreshed. Open it or try again shortly."
				var off *core.LinkError
				if errors.As(err, &off) {
					// The link was on a moment ago and Core has just refused it.
					sources[i].Message = linkOffSentence(off.Reason)
					s.forgetCapable(p.user.Email)
				}
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

// useHardWired reports whether a failed call through a Core link leaves the
// hand-written adapter as the way to go: Core has just refused the link, or
// the app that runs is older than its manifest and does not serve the route.
func useHardWired(err error) bool {
	var off *core.LinkError
	var refused *core.CapabilityError
	if errors.As(err, &off) {
		return true
	}
	return errors.As(err, &refused) && (refused.Status == http.StatusNotFound || refused.Status == http.StatusMethodNotAllowed)
}

// loadSource fills one app's part of the day: through the Core link when the
// app offers a widget and the link is on for the person, else with the
// hand-written adapter (first-party apps only, with the person's own token).
func (s *Server) loadSource(ctx context.Context, dst *dailySource, email, token, date string) error {
	app := dst.personalApp
	if app.linkedWidget() {
		err := s.loadWidget(ctx, dst, email)
		if err == nil || !app.hardSource() || !useHardWired(err) {
			return err
		}
	}
	if !app.hardSource() {
		return errors.New("the app has no widget for this person")
	}
	if err := loadDailySource(ctx, dst, token, date); err != nil {
		return err
	}
	for _, m := range dst.Metrics {
		dst.Figures = append(dst.Figures, dailyFigure{Label: m.Label, Value: strconv.Itoa(m.Value)})
	}
	return nil
}

// loadWidget reads the app's widget for the person with a link token (the
// person's own token is not involved) and puts it in the shape /daily has
// always had.
func (s *Server) loadWidget(ctx context.Context, dst *dailySource, email string) error {
	app := dst.personalApp
	data, err := s.core.WidgetIn(ctx, email, app.Kind)
	if err != nil {
		return err
	}
	// The SDK answers the app's own front door when the widget names no place; that is no place.
	if dst.Open = appLink(app.public, data.URL); strings.TrimRight(dst.Open, "/") == app.public {
		dst.Open = ""
	}
	dst.Line = oneLine(data.Line, 200)
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
		dst.Items = append(dst.Items, dailyItem{ID: id, Ref: oneLine(it.ID, 100), Title: title, Detail: oneLine(it.Detail, 200), Done: it.Done, URL: appLink(app.public, it.URL)})
		if len(dst.Items) == maxWidgetItems {
			break
		}
	}
	return nil
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
