/* ===================== EXPLORER SHELL ===================== */
const { useState } = React;

const SCREENS = [
  { id: "landing", n: "01", label: "Landing", k: "The “Today” entry", title: "Landing — “Today”",
    desc: "Opens straight into today's puzzle, no login wall. One photo, a Day # badge, a one-line theme, live player count, and a single Play CTA.", C: window.LandingScreen },
  { id: "editor", n: "02", label: "Editor", k: "The 5-minute game", title: "Editor — the heart",
    desc: "Photo + ~10 Lightroom-lite sliders + a calm countdown. The hardest layout problem: how the photo and the controls share a small screen. Three takes below.", C: window.EditorScreen },
  { id: "reveal", n: "03", label: "Submit → Reveal", k: "The commit moment", title: "Submit → Reveal",
    desc: "The commit→reveal beat: lock your edit (no re-edits today), then unlock everyone else's. The only path to the payoff is submitting your own.", C: window.RevealScreen },
  { id: "gallery", n: "04", label: "Gallery", k: "Everyone's edits", title: "Reveal gallery",
    desc: "Every edit of the same photo — humans + AI (badged). Your edit pinned with a You marker; sort by Top / New / Surprising; tap any tile to inspect.", C: window.GalleryScreen },
  { id: "detail", n: "05", label: "Inspect", k: "See the exact settings", title: "Edit detail · inspect settings",
    desc: "The signature feature: see the exact slider values behind any edit and load them onto the raw photo to compare against yours.", C: window.DetailScreen },
  { id: "share", n: "06", label: "Share card", k: "The result", title: "Result / share card",
    desc: "Spoiler-safe result: Day #, your edit, a stat line, and a small generative color signature. One-tap share, then a countdown to tomorrow.", C: window.ShareScreen },
];

function Toggle({ options, value, onChange }) {
  return (
    <span className="seg">
      {options.map(o => (
        <button key={o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </span>
  );
}

function App() {
  const [screen, setScreen] = useState(() => localStorage.getItem("cg_screen") || "landing");
  const [device, setDevice] = useState(() => localStorage.getItem("cg_device") || "phone");
  const [vibe, setVibe] = useState(() => localStorage.getItem("cg_vibe") || "playful");

  const set = (k, fn, v) => { fn(v); localStorage.setItem(k, v); };
  const cur = SCREENS.find(s => s.id === screen) || SCREENS[0];
  const Screen = cur.C;

  return (
    <div className={"explorer vibe-" + vibe}>
      <div className="topbar">
        <div className="brand">
          <span className="dot"></span>
          <h1>color-gradle</h1>
          <span className="sub">wireframes · v1</span>
        </div>
        <span className="spacer"></span>
        <div className="ctrl">
          <span className="cap">Vibe</span>
          <Toggle value={vibe} onChange={v => set("cg_vibe", setVibe, v)}
            options={[{ v: "playful", label: "Playful" }, { v: "crafted", label: "Crafted" }]} />
        </div>
        <div className="ctrl">
          <span className="cap">Device</span>
          <Toggle value={device} onChange={v => set("cg_device", setDevice, v)}
            options={[{ v: "phone", label: "Phone" }, { v: "desk", label: "Desktop" }]} />
        </div>
      </div>

      <div className="tabs">
        {SCREENS.map(s => (
          <button key={s.id} className={"tab" + (s.id === screen ? " on" : "")} onClick={() => set("cg_screen", setScreen, s.id)}>
            <span className="n">{s.n}</span>{s.label}
          </button>
        ))}
      </div>

      <div className="screenhead">
        <div className="k">{cur.n} · {cur.k}</div>
        <h2>{cur.title}</h2>
        <p>{cur.desc}</p>
      </div>

      <div className={"canvas" + (device === "desk" ? " desk-mode" : "")} key={screen + device}>
        <Screen device={device} />
      </div>

      <div className="legend">
        <span><b>3 approaches</b> per screen</span>
        <span>·</span>
        <span>hatched box = <b>image / photo</b></span>
        <span>·</span>
        <span>✎ = <b>design note</b></span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
