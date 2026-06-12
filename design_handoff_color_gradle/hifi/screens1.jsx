/* ===================== HI-FI SCREENS · Landing + Editor ===================== */
const { useState: uS, useEffect: uE, useRef: uR } = React;
const { Photo: PH, Slider: SL, Signature: SG } = window;

/* ---------------- LANDING (A1) ---------------- */
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

function Landing({ src, setSrc, go, device, day = 128, theme = "Golden Hour Street", played, user, tone, onAccount, onHowTo }) {
  const Acct = window.Account;
  if (device === "desktop") {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "var(--maxw)", margin: "0 auto", padding: "48px 40px", display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: 56, alignItems: "center" }}>
          <div className="col" style={{ gap: 22 }}>
            <div className="row between">
              <div className="row" style={{ gap: 10 }}>
                <Smiley />
                <span style={{ fontWeight: 700, letterSpacing: "-.01em", whiteSpace: "nowrap" }}>color-gradle</span>
              </div>
            </div>
            <div style={{ flex: "0 0 auto", height: 8 }}></div>
            <div className="eyebrow">Day {day} &nbsp;·&nbsp; {new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</div>
            <h1 className="h-xl">{theme}</h1>
            {!played && <p className="dim" style={{ fontSize: 18, maxWidth: 440, margin: 0 }}>One unedited photo. Five minutes. Ten sliders. Submit your look to see how everyone, human and AI, edited the same shot.</p>}
            {played ? (
              <div className="col" style={{ gap: 16, marginTop: 2 }}>
                <div className="row" style={{ gap: 14, alignItems: "center" }}>
                  <PH tone={tone} src={src} radius="var(--r-sm)" style={{ width: 72, height: 90, flex: "0 0 auto" }} />
                  <div className="col" style={{ gap: 5 }}>
                    <span className="row" style={{ gap: 8 }}><span className="badge accent">✓ Played</span><span style={{ fontWeight: 600 }}>Top 8% today</span></span>
                    <span className="mono dim" style={{ fontSize: 13 }}>23 ♥ · ranked by likes</span>
                    <span className="mono dim3" style={{ fontSize: 12 }}>Next photo in 06:14:22</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <button className="btn primary lg" onClick={() => go("gallery")}>See today's gallery</button>
                  <button className="btn lg" onClick={() => go("share")}>Share result</button>
                </div>
              </div>
            ) : (
              <div className="row" style={{ gap: 14, marginTop: 6 }}>
                <button className="btn primary lg" onClick={() => go("editor")}>Play today's photo</button>
                <button className="btn ghost" onClick={onHowTo}>How to play</button>
              </div>
            )}
          </div>
          {/* contained hero stage — fixed aspect, never stretched */}
          <div style={{ position: "relative" }}>
            <PH src={src} radius="var(--r)" style={{ aspectRatio: "4 / 5", boxShadow: "var(--shadow)" }} scrim="soft">
              <div className="row between" style={{ position: "absolute", left: 0, right: 0, top: 0, padding: 16 }}>
                <span className="badge solid">Day {day}</span>
                <span className="badge">Unedited</span>
              </div>
            </PH>
          </div>
        </div>
      </div>
    );
  }
  /* phone — true full-bleed */
  return (
    <div className="screen">
      <PH src={src} style={{ position: "absolute", inset: 0 }} scrim>
        <div className="col" style={{ position: "relative", height: "100%", padding: "20px 20px 30px" }}>
          <div className="row between">
            <div className="row" style={{ gap: 9 }}>
              <Smiley size={20} />
              <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>color-gradle</span>
            </div>
          </div>
          <div className="fill1"></div>
          <span className="badge solid" style={{ alignSelf: "flex-start", marginBottom: 14 }}>Day {day}</span>
          <div className="eyebrow" style={{ color: "#e9e2d3" }}>Today's theme</div>
          <h1 className="h-lg" style={{ marginTop: 8, color: "#fff" }}>{theme}</h1>
          {played ? (
            <div className="col" style={{ gap: 12, marginTop: 16 }}>
              <div className="row" style={{ gap: 11, alignItems: "center" }}>
                <PH tone={tone} src={src} radius="8px" style={{ width: 46, height: 58, flex: "0 0 auto" }} />
                <div className="col" style={{ gap: 3 }}>
                  <span className="row" style={{ gap: 7 }}><span className="badge accent">✓ Played</span><span style={{ color: "#fff", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>Top 8%</span></span>
                  <span className="mono" style={{ fontSize: 11.5, color: "#d8d1c3", whiteSpace: "nowrap" }}>23 ♥ · next in 06:14:22</span>
                </div>
              </div>
              <button className="btn primary lg block" onClick={() => go("gallery")}>See today's gallery</button>
            </div>
          ) : (
            <>
              <button className="btn primary lg block" style={{ marginTop: 20 }} onClick={() => go("editor")}>Play today's photo</button>
              <div className="row between" style={{ marginTop: 14 }}>
                <span className="mono" style={{ fontSize: 12, color: "#d8d1c3" }}>5:00 · no login</span>
                <span onClick={onHowTo} style={{ fontSize: 12.5, color: "#e9e2d3", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>How to play</span>
              </div>
            </>
          )}
        </div>
      </PH>
    </div>
  );
}

/* ---------------- EDITOR (E2) ---------------- */
function fmt(s) { const m = Math.floor(s / 60), ss = s % 60; return m + ":" + String(ss).padStart(2, "0"); }

function Editor({ tone, setVal, resetTone, src, setSrc, go, device, day = 128, onExpire, photoError }) {
  const [left, setLeft] = uS(297);
  const [compare, setCompare] = uS(false);
  const [err, setErr] = uS(!!photoError);
  uE(() => {
    if (left <= 0) { (onExpire || (() => go("reveal")))(); return; }
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const shown = compare ? window.ZERO : tone;
  const PhotoErr = window.PhotoError;

  const TopBar = (
    <div className="row between" style={{ position: "absolute", left: 0, right: 0, top: 0, padding: 16, zIndex: 3 }}>
      <button className="btn ghost sm" style={{ color: "#f2eee5" }} onClick={() => go("landing")}>‹ Exit</button>
      <div className="row" style={{ gap: 9 }}>
        <span className="badge solid">Day {day}</span>
        <span className={"timer" + (left <= 60 ? " warn" : "")}>{fmt(left)}</span>
      </div>
    </div>
  );
  const compareBtn = (
    <button className="btn ghost sm" style={{ color: "#f2eee5", borderColor: "rgba(255,255,255,.22)", background: "rgba(8,7,6,.35)" }}
      onMouseDown={() => setCompare(true)} onMouseUp={() => setCompare(false)} onMouseLeave={() => setCompare(false)}
      onTouchStart={() => setCompare(true)} onTouchEnd={() => setCompare(false)}>
      {compare ? "Before" : device === "phone" ? "Tap to compare" : "Hold to compare"}
    </button>
  );
  const List = (
    <div className="col" style={{ gap: 20 }}>
      {SLIDERS.map((s) => <SL key={s.key} s={s} value={tone[s.key]} onChange={(v) => setVal(s.key, v)} />)}
    </div>
  );

  if (device === "desktop") {
    return (
      <div className="screen">
        {TopBar}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", height: "100vh" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--bg-2)" }}>
            <PH tone={shown} src={src} radius="var(--r)" style={{ width: "100%", maxWidth: 640, aspectRatio: "4 / 5", boxShadow: "var(--shadow)" }}>
              {err ? <PhotoErr onRetry={() => setErr(false)} /> : <div style={{ position: "absolute", left: 16, bottom: 16 }}>{compareBtn}</div>}
            </PH>
          </div>
          <div className="col" style={{ borderLeft: "1px solid var(--line)", background: "var(--panel)" }}>
            <div className="row between" style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
              <span className="h-md">Adjust</span><span className="mono dim3" style={{ fontSize: 12, whiteSpace: "nowrap" }}>10 sliders</span>
            </div>
            <div className="fill1" style={{ overflowY: "auto", padding: "22px" }}>{List}</div>
            <div className="row between" style={{ padding: 18, borderTop: "1px solid var(--line)", gap: 12 }}>
              <button className="btn ghost" onClick={resetTone}>Reset</button>
              <button className="btn primary fill1" onClick={() => go("reveal")}>Submit edit</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  /* phone */
  return (
    <div className="screen">
      <div style={{ position: "relative", height: "46vh", flex: "0 0 auto" }}>
        <PH tone={shown} src={src} style={{ position: "absolute", inset: 0 }}></PH>
        {err ? <PhotoErr onRetry={() => setErr(false)} light /> : null}
        {TopBar}
        {!err ? <div style={{ position: "absolute", left: 16, bottom: 14, zIndex: 3 }}>{compareBtn}</div> : null}
      </div>
      <div className="fill1" style={{ overflowY: "auto", padding: "20px 18px 16px", background: "var(--panel)", borderTop: "1px solid var(--line-2)" }}>
        <div className="row between" style={{ marginBottom: 18 }}>
          <span className="eyebrow">Adjust</span><span className="mono dim3" style={{ fontSize: 12, whiteSpace: "nowrap" }}>10 sliders</span>
        </div>
        {List}
        <div style={{ height: 8 }}></div>
      </div>
      <div className="row between" style={{ padding: 14, gap: 12, background: "var(--panel)", borderTop: "1px solid var(--line)" }}>
        <button className="btn ghost" onClick={resetTone}>Reset</button>
        <button className="btn primary fill1" onClick={() => go("reveal")}>Submit</button>
      </div>
    </div>
  );
}

Object.assign(window, { Landing, Editor });
