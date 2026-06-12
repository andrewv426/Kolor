/* ===================== color-gradle · hi-fi app shell ===================== */
const { useState: aS, useEffect: aE } = React;
const {
  Landing, Editor, Reveal, Gallery, Detail, Share,
  SEED_TONE, ZERO, PRESETS, HowTo, Login,
  useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle,
} = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "darkroom",
  "accent": "#E0A75C",
  "grain": true
}/*EDITMODE-END*/;

const FLOW = [
  ["landing", "01 Landing"], ["editor", "02 Editor"], ["reveal", "03 Reveal"],
  ["gallery", "04 Gallery"], ["detail", "05 Inspect"], ["share", "06 Result"],
];

function load(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = aS(() => load("cg2_screen", "landing"));
  const [device, setDevice] = aS(() => load("cg2_device", "phone"));
  const [tone, setTone] = aS(() => load("cg2_tone", SEED_TONE));
  const [src, setSrc] = aS(() => load("cg2_src", null));
  const [liked, setLiked] = aS(() => new Set(load("cg2_liked", [])));
  const [active, setActive] = aS(null);
  // identity + play state
  const [played, setPlayed] = aS(() => load("cg2_played", false));
  const [user, setUser] = aS(() => load("cg2_user", null));
  const [howto, setHowto] = aS(() => !load("cg2_seen_howto", false));
  const [login, setLogin] = aS(false);
  // demo-only edge states (not persisted)
  const [early, setEarly] = aS(false);
  const [photoError, setPhotoError] = aS(false);
  const [statesOpen, setStatesOpen] = aS(false);
  // set by the admin/curator console; fall back to defaults
  const theme = load("cg2_theme", "Golden Hour Street");
  const day = load("cg2_day", "128");

  aE(() => save("cg2_screen", screen), [screen]);
  aE(() => save("cg2_device", device), [device]);
  aE(() => save("cg2_tone", tone), [tone]);
  aE(() => save("cg2_src", src), [src]);
  aE(() => save("cg2_liked", [...liked]), [liked]);
  aE(() => save("cg2_played", played), [played]);
  aE(() => save("cg2_user", user), [user]);

  const go = (s) => { setScreen(s); if (device === "desktop") window.scrollTo(0, 0); };
  const setVal = (k, v) => setTone((o) => ({ ...o, [k]: v }));
  const resetTone = () => setTone({ ...ZERO });
  const toggleLike = (id) => setLiked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const openDetail = (p) => { setActive(p); go("detail"); };
  const loadOntoMine = (tn) => { setTone({ ...tn }); go("editor"); };
  const closeHowto = () => { setHowto(false); save("cg2_seen_howto", true); };
  const lockIn = () => { setPlayed(true); setEarly(false); go("gallery"); };  // ranked by likes
  const onLogin = (name) => { setUser(name); setLogin(false); };

  // demo scenario presets (so the edge states are previewable)
  const scenario = (name) => {
    setStatesOpen(false);
    if (name === "firstrun") { setPlayed(false); setHowto(true); go("landing"); }
    else if (name === "played") { setPlayed(true); go("landing"); }
    else if (name === "login") { go("landing"); setLogin(true); }
    else if (name === "early") { setEarly(true); go("gallery"); }
    else if (name === "photoerror") { setPhotoError(true); go("editor"); }
    else if (name === "reset") { setPlayed(false); setUser(null); setEarly(false); setPhotoError(false); setTone({ ...SEED_TONE }); go("landing"); }
  };

  const common = { tone, src, setSrc, go, device, theme, day };
  let view = null;
  if (screen === "landing") view = <Landing {...common} setSrc={setSrc} played={played} user={user} onAccount={() => setLogin(true)} onHowTo={() => setHowto(true)} />;
  else if (screen === "editor") view = <Editor {...common} setVal={setVal} resetTone={resetTone} onExpire={lockIn} photoError={photoError} />;
  else if (screen === "reveal") view = <Reveal {...common} onLock={lockIn} />;
  else if (screen === "gallery") view = <Gallery {...common} presets={PRESETS} liked={liked} toggleLike={toggleLike} openDetail={openDetail} early={early} user={user} />;
  else if (screen === "detail") view = <Detail preset={active || PRESETS[1]} src={src} liked={liked} toggleLike={toggleLike} loadOntoMine={loadOntoMine} back={() => go("gallery")} device={device} />;
  else if (screen === "share") view = <Share {...common} user={user} />;

  const rootStyle = { "--accent": t.accent };

  return (
    <div className={"cg" + (t.theme === "paper" ? " paper" : "") + (t.grain ? "" : " nograin")} style={rootStyle}>
      <div className="stage">
        <div className={"viewport " + device}>
          {view}
          {howto ? <HowTo onClose={closeHowto} /> : null}
          {login ? <Login onClose={() => setLogin(false)} onLogin={onLogin} /> : null}
        </div>
      </div>

      {/* prototype chrome */}
      <div className="statesmenu">
        {statesOpen ? (
          <div className="statespop">
            <span className="sh">PREVIEW A STATE</span>
            <button className="si" onClick={() => scenario("firstrun")}>First-run · how to play</button>
            <button className="si" onClick={() => scenario("played")}>Already played today</button>
            <button className="si" onClick={() => scenario("login")}>Log in dialog</button>
            <button className="si" onClick={() => scenario("early")}>Gallery · early / few edits</button>
            <button className="si" onClick={() => scenario("photoerror")}>Editor · photo failed</button>
            <span className="sh">RESET</span>
            <button className="si" onClick={() => scenario("reset")}>Back to a fresh day</button>
          </div>
        ) : null}
        <div className="trigger" onClick={() => setStatesOpen((o) => !o)}>States {statesOpen ? "▾" : "▴"}</div>
      </div>
      <div className="devtoggle">
        <a href="color-gradle Admin.html" style={{ display: "inline-flex", alignItems: "center", padding: "7px 13px", color: "var(--ink-2)", textDecoration: "none", fontSize: 12.5, fontWeight: 600, borderRight: "1px solid var(--line)" }} title="Curator console">Admin</a>
        <button className={device === "phone" ? "on" : ""} onClick={() => setDevice("phone")}>Phone</button>
        <button className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")}>Desktop</button>
      </div>
      <div className="flownav">
        {FLOW.map(([s, label]) => (
          <span key={s} className={"fb" + (s === screen ? " on" : "")} onClick={() => go(s)}>{label}</span>
        ))}
      </div>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio label="Surface" value={t.theme} options={["darkroom", "paper"]} onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Accent" value={t.accent}
          options={["#E0A75C", "#D98A86", "#9DB089", "#7FA8C9", "#B79BD0"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakToggle label="Film grain" value={t.grain} onChange={(v) => setTweak("grain", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
