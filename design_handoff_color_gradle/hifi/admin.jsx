/* ===================== color-gradle · ADMIN dashboard ===================== */
const { useState: adS, useEffect: adE } = React;
const { Photo: AdPhoto, Slider: AdSlider, Signature: AdSig } = window;
const { SCENES, SCHEDULE, ANALYTICS, FLAGGED, AI_PLAYERS } = window;

function load(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

/* --- tiny icon set --- */
const Ic = {
  today: <svg className="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v3M13 2v3"/></svg>,
  photo: <svg className="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="8" cy="9" r="1.6"/><path d="M4 15l4-3 3 2 3-3 2 2"/></svg>,
  sched: <svg className="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h12M4 10h12M4 14h8"/></svg>,
  rules: <svg className="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h7M4 10h12M4 14h5"/><circle cx="14" cy="6" r="2"/><circle cx="9" cy="14" r="2"/></svg>,
  ai: <svg className="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="5" width="12" height="11" rx="2.5"/><path d="M10 2v3M7 9v2M13 9v2"/></svg>,
  mod: <svg className="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10 3l6 2v4c0 4-3 6-6 8-3-2-6-4-6-8V5z"/></svg>,
  stats: <svg className="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 16V9M9 16V4M14 16v-5"/></svg>,
};

function Smiley({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" style={{ display: "block", flex: "0 0 auto" }}>
      <circle cx="11" cy="11" r="10" fill="var(--accent)" />
      <circle cx="7.6" cy="8.8" r="1.35" fill="var(--accent-ink)" />
      <circle cx="14.4" cy="8.8" r="1.35" fill="var(--accent-ink)" />
      <path d="M6.6 12.6 Q11 16.4 15.4 12.6" stroke="var(--accent-ink)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Switch({ on, onClick }) {
  return <span className={"sw" + (on ? " on" : "")} onClick={onClick} role="switch" aria-checked={on}><span className="dot"></span></span>;
}

function SceneThumb({ scene, src, style }) {
  if (src) return <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center", ...style }}></div>;
  return <div style={{ position: "absolute", inset: 0, background: SCENES[scene] || SCENES.golden, ...style }}></div>;
}

function Field({ k, children }) {
  return <label className="field"><span className="k">{k}</span>{children}</label>;
}

function SetRow({ t, d, children }) {
  return (
    <div className="setrow">
      <div className="lead"><div className="t">{t}</div>{d ? <div className="d">{d}</div> : null}</div>
      {children}
    </div>
  );
}

/* ============================ TODAY ============================ */
function TodayPanel({ cfg, setCfg, src, setSrc }) {
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setSrc(r.result);
    r.readAsDataURL(f);
  };
  const a = ANALYTICS.today;
  return (
    <div className="today-grid">
      {/* photo management */}
      <div className="panel">
        <div className="panel-h"><span className="t">Today's photo</span><span className="status live">● Live now</span></div>
        <AdPhoto src={src} radius="var(--r-sm)" style={{ width: "100%", aspectRatio: "4 / 5" }}>
          <div className="row" style={{ position: "absolute", left: 12, top: 12, gap: 8 }}>
            <span className="badge solid">Day {cfg.day}</span>
            <span className="badge">Unedited master</span>
          </div>
        </AdPhoto>
        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <label className="btn primary" style={{ flex: 1 }}>
            Change photo
            <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          </label>
          <button className="btn" onClick={() => setSrc(null)} disabled={!src} style={!src ? { opacity: .5 } : null}>Reset to sample</button>
        </div>
        <label className="drop" style={{ marginTop: 10 }}>
          Drop a RAW or JPEG, or click to browse. Best at 4:5, 2000px or larger.
          <input type="file" accept="image/*" onChange={onFile} />
        </label>
        <div className="row between mono" style={{ marginTop: 14, fontSize: 11.5, color: "var(--ink-3)" }}>
          <span>{src ? "custom-upload.jpg" : "sample-scene.synthetic"}</span>
          <span>·</span>
          <span>master hidden until reveal</span>
        </div>
      </div>

      {/* details + publishing + stats */}
      <div className="col" style={{ gap: 22 }}>
        <div className="panel">
          <div className="panel-h"><span className="t">Details</span></div>
          <div className="col" style={{ gap: 14 }}>
            <Field k="Theme name (shown on landing)">
              <input className="input" value={cfg.theme} onChange={(e) => setCfg({ ...cfg, theme: e.target.value })} />
            </Field>
            <div className="row" style={{ gap: 12 }}>
              <Field k="Day #"><input className="input" value={cfg.day} onChange={(e) => setCfg({ ...cfg, day: e.target.value.replace(/\D/g, "") || cfg.day })} /></Field>
              <Field k="Category">
                <select className="selectx" value={cfg.category} onChange={(e) => setCfg({ ...cfg, category: e.target.value })}>
                  <option>Street</option><option>Portrait</option><option>Landscape</option><option>Still life</option><option>Architecture</option>
                </select>
              </Field>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><span className="t">Publishing</span></div>
          <div className="col">
            <SetRow t="Daily reset" d="When today flips to the next photo">
              <select className="selectx" style={{ width: 130 }} value={cfg.reset} onChange={(e) => setCfg({ ...cfg, reset: e.target.value })}>
                <option>00:00 local</option><option>09:00 ET</option><option>00:00 UTC</option>
              </select>
            </SetRow>
            <SetRow t="Show live player count" d="The pulsing count on the gallery">
              <Switch on={cfg.showLive} onClick={() => setCfg({ ...cfg, showLive: !cfg.showLive })} />
            </SetRow>
            <SetRow t="Allow late entries" d="Submit after the 5-min clock ends">
              <Switch on={cfg.lateEntries} onClick={() => setCfg({ ...cfg, lateEntries: !cfg.lateEntries })} />
            </SetRow>
          </div>
        </div>

        <div className="statgrid">
          <div className="stat"><div className="v">{a.players.toLocaleString()}</div><div className="l">Players today</div></div>
          <div className="stat"><div className="v">{Math.round(a.completion * 100)}%</div><div className="l">Completed</div></div>
        </div>
      </div>
    </div>
  );
}

/* ============================ SCHEDULE ============================ */
function SchedulePanel({ cfg }) {
  const live = SCHEDULE.filter(s => s.status !== "archived");
  const past = SCHEDULE.filter(s => s.status === "archived");
  const Row = (s) => (
    <div className="schrow" key={s.day}>
      <div className="schthumb"><SceneThumb scene={s.scene} /></div>
      <div className="col" style={{ gap: 4, minWidth: 0 }}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.day === 128 ? cfg.theme : s.theme}</span>
          <span className={"status " + s.status}>{s.status}</span>
        </div>
        <span className="mono dim3" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
          Day {s.day} · {s.date}{s.players ? ` · ${s.players.toLocaleString()} played · ${s.edits} edits` : ""}
        </span>
      </div>
      <button className="btn sm">{s.status === "archived" ? "View" : "Edit"}</button>
    </div>
  );
  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-h">
          <span className="t">Upcoming queue</span>
          <button className="btn sm primary">+ Schedule a day</button>
        </div>
        {live.map(Row)}
      </div>
      <div className="panel">
        <div className="panel-h"><span className="t">Archive</span><span className="h">Past photos & their galleries</span></div>
        {past.map(Row)}
      </div>
    </div>
  );
}

/* ============================ GAME RULES ============================ */
const ALL_SLIDERS = window.SLIDERS;
function RulesPanel({ cfg, setCfg }) {
  const toggleSlider = (key) => {
    const off = new Set(cfg.disabledSliders);
    off.has(key) ? off.delete(key) : off.add(key);
    setCfg({ ...cfg, disabledSliders: [...off] });
  };
  return (
    <div className="rules-grid">
      <div className="panel">
        <div className="panel-h"><span className="t">The round</span></div>
        <div className="col">
          <SetRow t="Time limit" d={`Players get ${cfg.minutes}:00 on the clock`}>
            <select className="selectx" style={{ width: 92 }} value={cfg.minutes} onChange={(e) => setCfg({ ...cfg, minutes: parseInt(e.target.value, 10) })}>
              {[2, 3, 4, 5, 7, 10].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </SetRow>
          <SetRow t="Allow reset" d="The ⤺ Reset button in the editor">
            <Switch on={cfg.allowReset} onClick={() => setCfg({ ...cfg, allowReset: !cfg.allowReset })} />
          </SetRow>
          <SetRow t="Hold to compare" d="Press-and-hold to see the original">
            <Switch on={cfg.holdCompare} onClick={() => setCfg({ ...cfg, holdCompare: !cfg.holdCompare })} />
          </SetRow>
          <SetRow t="One submission per day" d="Lock the photo after submitting">
            <Switch on={cfg.lockSubmit} onClick={() => setCfg({ ...cfg, lockSubmit: !cfg.lockSubmit })} />
          </SetRow>
        </div>
      </div>
      <div className="panel">
        <div className="panel-h"><span className="t">Available adjustments</span><span className="h">{ALL_SLIDERS.length - cfg.disabledSliders.length} of {ALL_SLIDERS.length} on</span></div>
        <div className="col">
          {ALL_SLIDERS.map((s) => (
            <SetRow key={s.key} t={s.label}>
              <Switch on={!cfg.disabledSliders.includes(s.key)} onClick={() => toggleSlider(s.key)} />
            </SetRow>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================ AI PLAYERS ============================ */
function AIPanel() {
  const [models, setModels] = adS(() => load("cg2_ai", AI_PLAYERS));
  adE(() => save("cg2_ai", models), [models]);
  const toggle = (id) => setModels(models.map(m => m.id === id ? { ...m, on: !m.on } : m));
  return (
    <div className="col" style={{ gap: 22, maxWidth: 620 }}>
      <div className="panel">
        <div className="panel-h"><span className="t">AI players</span><span className="h">Edits are clearly badged in the gallery</span></div>
        <div className="col">
          {models.map((m) => (
            <SetRow key={m.id} t={<span className="row" style={{ gap: 8 }}><span className="badge ai">AI</span>{m.name}</span>} d={m.on ? "Submits one edit each day" : "Paused"}>
              <Switch on={m.on} onClick={() => toggle(m.id)} />
            </SetRow>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-h"><span className="t">Behavior</span></div>
        <SetRow t="Reveal AI before humans" d="Show model edits in the reveal beat first">
          <Switch on={false} onClick={() => {}} />
        </SetRow>
        <SetRow t="Let AI edits be liked" d="Count toward the daily leaderboard">
          <Switch on={true} onClick={() => {}} />
        </SetRow>
      </div>
    </div>
  );
}

/* ============================ ANALYTICS ============================ */
function AnalyticsPanel() {
  const a = ANALYTICS.today;
  const max = Math.max(...ANALYTICS.week.map(w => w.v));
  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="statgrid">
        <div className="stat"><div className="v">{a.players.toLocaleString()}</div><div className="l">Players today</div></div>
        <div className="stat"><div className="v">{Math.round(a.completion * 100)}%</div><div className="l">Completion rate</div></div>
        <div className="stat"><div className="v">{a.median}</div><div className="l">Median time</div></div>
        <div className="stat"><div className="v">{a.likes.toLocaleString()}</div><div className="l">Likes today</div></div>
        <div className="stat"><div className="v">{Math.round(a.returning * 100)}%</div><div className="l">Returning</div></div>
      </div>
      <div className="panel">
        <div className="panel-h"><span className="t">Completion rate · last 7 days</span></div>
        <div className="bars7">
          {ANALYTICS.week.map((w) => (
            <div className="b" key={w.d}>
              <div className="bar" style={{ height: (w.v / max * 100) + "%", opacity: w.d === "Sun" ? 1 : .55 }}></div>
              <span className="bl">{w.d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================ MODERATION ============================ */
function ModPanel({ src }) {
  const [queue, setQueue] = adS(FLAGGED);
  const act = (id) => setQueue(queue.filter(q => q.id !== id));
  return (
    <div className="panel" style={{ maxWidth: 680 }}>
      <div className="panel-h"><span className="t">Flagged edits</span><span className="h">{queue.length} awaiting review</span></div>
      {queue.length === 0 ? <div className="dim" style={{ padding: "20px 0", fontSize: 14 }}>Queue clear. Nice.</div> : null}
      <div className="col" style={{ gap: 12 }}>
        {queue.map((q) => (
          <div className="schrow" key={q.id} style={{ gridTemplateColumns: "64px 1fr auto" }}>
            <div className="schthumb"><AdPhoto tone={q.tone} src={src} style={{ position: "absolute", inset: 0 }} /></div>
            <div className="col" style={{ gap: 4 }}>
              <span style={{ fontWeight: 600 }}>{q.who}</span>
              <span className="mono dim3" style={{ fontSize: 12 }}>{q.reason}</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => act(q.id)}>Keep</button>
              <button className="btn sm" onClick={() => act(q.id)} style={{ color: "#D98A86", borderColor: "#D98A86" }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ SHELL ============================ */
const NAV = [
  { id: "today", label: "Today", ic: Ic.today },
  { id: "schedule", label: "Schedule", ic: Ic.sched, ct: "5" },
  { id: "rules", label: "Game rules", ic: Ic.rules },
  { id: "ai", label: "AI players", ic: Ic.ai },
  { id: "mod", label: "Moderation", ic: Ic.mod, ct: "2" },
  { id: "stats", label: "Analytics", ic: Ic.stats },
];
const TITLES = {
  today: ["Today", "Manage the live puzzle"],
  schedule: ["Schedule", "Queue and archive of daily photos"],
  rules: ["Game rules", "How a round plays"],
  ai: ["AI players", "Which models compete"],
  mod: ["Moderation", "Review flagged edits"],
  stats: ["Analytics", "How the game is performing"],
};

const CFG_DEFAULT = {
  theme: "Golden Hour Street", day: "128", category: "Street",
  reset: "00:00 local", showLive: true, lateEntries: false,
  minutes: 5, allowReset: true, holdCompare: true, lockSubmit: true,
  disabledSliders: [],
};

function AdminApp() {
  const [page, setPage] = adS(() => load("cg2_admin_page", "today"));
  const [cfg, setCfg] = adS(() => ({ ...CFG_DEFAULT, ...load("cg2_cfg", {}) }));
  const [src, setSrc] = adS(() => load("cg2_src", null));
  const [saved, setSaved] = adS(false);

  adE(() => save("cg2_admin_page", page), [page]);
  adE(() => { save("cg2_src", src); }, [src]);

  // sync the bits the game reads
  const persistCfg = (next) => {
    setCfg(next);
    save("cg2_cfg", next);
    save("cg2_theme", next.theme);
    save("cg2_day", next.day);
    setSaved(true);
    clearTimeout(window.__cgsave);
    window.__cgsave = setTimeout(() => setSaved(false), 1400);
  };

  const [t] = [{ theme: cfg.theme }];
  const [title, sub] = TITLES[page];

  let body = null;
  if (page === "today") body = <TodayPanel cfg={cfg} setCfg={persistCfg} src={src} setSrc={setSrc} />;
  else if (page === "schedule") body = <SchedulePanel cfg={cfg} />;
  else if (page === "rules") body = <RulesPanel cfg={cfg} setCfg={persistCfg} />;
  else if (page === "ai") body = <AIPanel />;
  else if (page === "mod") body = <ModPanel src={src} />;
  else if (page === "stats") body = <AnalyticsPanel />;

  return (
    <div className="cg">
      <div className="adm">
        <aside className="adm-side">
          <div className="adm-brand"><Smiley /><div className="col"><span className="nm">color-gradle</span><span className="role">CURATOR CONSOLE</span></div></div>
          <nav className="adm-nav">
            <span className="lbl">Manage</span>
            {NAV.map((n) => (
              <div key={n.id} className={"navitem" + (page === n.id ? " on" : "")} onClick={() => setPage(n.id)}>
                {n.ic}<span>{n.label}</span>{n.ct ? <span className="ct">{n.ct}</span> : null}
              </div>
            ))}
          </nav>
          <div style={{ flex: 1 }}></div>
          <a className="toplink" href="color-gradle Hi-fi.html" style={{ justifyContent: "center" }}>View live game</a>
        </aside>

        <main className="adm-main">
          <div className="adm-top">
            <div className="col" style={{ gap: 2 }}>
              <h1>{title}</h1><span className="sub">{sub}</span>
            </div>
            <div style={{ flex: 1 }}></div>
            <span className="mono dim3" style={{ fontSize: 12, opacity: saved ? 1 : 0, transition: "opacity .2s", color: "var(--accent)" }}>✓ saved</span>
            <button className="btn primary sm">Publish changes</button>
          </div>
          <div className="adm-body">{body}</div>
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
