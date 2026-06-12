/* ===================== HI-FI SCREENS · Detail + Share ===================== */
const { useState: u3S } = React;
const { Photo: P3, Slider: SL3, Signature: SG3, Heart: HT3, Av: AV3 } = window;

/* ---------------- DETAIL (D1 — photo + recipe) ---------------- */
function Detail({ preset, src, liked, toggleLike, loadOntoMine, back, device }) {
  const [cmp, setCmp] = u3S(false);
  if (!preset) return null;
  const isLiked = liked.has(preset.id);
  const who = preset.ai ? preset.name : preset.handle;

  const PhotoBlock = (big) => (
    <div style={{ position: "relative" }}>
      <P3 tone={cmp ? window.ZERO : preset.tone} src={src} radius={device === "desktop" ? "var(--r)" : 0}
        style={{ width: "100%", aspectRatio: device === "desktop" ? "4 / 5" : "1 / 1", maxHeight: big ? "none" : undefined }}></P3>
      <button className="btn ghost sm"
        style={{ position: "absolute", left: 14, bottom: 14, color: "#f2eee5", borderColor: "rgba(255,255,255,.22)", background: "rgba(8,7,6,.4)" }}
        onMouseDown={() => setCmp(true)} onMouseUp={() => setCmp(false)} onMouseLeave={() => setCmp(false)}
        onTouchStart={() => setCmp(true)} onTouchEnd={() => setCmp(false)}>
        {cmp ? "Original" : "Hold for original"}
      </button>
    </div>
  );

  const CreatorRow = (
    <div className="row between">
      <div className="row" style={{ gap: 10 }}>
        <AV3 />
        {preset.ai ? <span className="badge ai">{preset.name}</span> : <span style={{ fontWeight: 600 }}>{who}</span>}
      </div>
      <button className="btn sm" onClick={() => toggleLike(preset.id)} style={isLiked ? { color: "var(--accent)", borderColor: "var(--accent)" } : null}>
        {isLiked ? "♥" : "♡"} {preset.likes + (isLiked ? 1 : 0)}
      </button>
    </div>
  );

  const Recipe = (cols) => (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gap: cols > 1 ? "16px 28px" : 15 }}>
      {SLIDERS.map((s) => <SL3 key={s.key} s={s} value={preset.tone[s.key]} read />)}
    </div>
  );

  const TopNav = (
    <div className="row between" style={{ padding: device === "desktop" ? "16px 24px" : "12px 14px", position: device === "desktop" ? "static" : "absolute", left: 0, right: 0, top: 0, zIndex: 5 }}>
      <button className="btn ghost sm" style={device === "desktop" ? null : { color: "#fff", background: "rgba(8,7,6,.4)" }} onClick={back}>‹ Gallery</button>
      {device === "desktop" ? <span className="mono dim3" style={{ fontSize: 12 }}>edit · 8f2 · pipeline v1</span> : null}
    </div>
  );

  if (device === "desktop") {
    return (
      <div className="screen">
        {TopNav}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, padding: "8px 40px 40px", maxWidth: "var(--maxw)", margin: "0 auto", width: "100%", alignItems: "start" }}>
          <div>{PhotoBlock(true)}</div>
          <div className="col" style={{ gap: 22, paddingTop: 6 }}>
            {CreatorRow}
            <div className="divider"></div>
            <div className="row between"><span className="eyebrow">The recipe</span><span className="mono dim3" style={{ fontSize: 11 }}>v1</span></div>
            {Recipe(2)}
            <button className="btn primary lg block" onClick={() => loadOntoMine(preset.tone)}>Load these onto my photo</button>
            <span className="mono dim3" style={{ fontSize: 12, textAlign: "center" }}>re-renders your raw photo with their exact values</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="screen" style={{ overflowY: "auto" }}>
      <div style={{ position: "relative" }}>{PhotoBlock(false)}{TopNav}</div>
      <div className="col" style={{ gap: 18, padding: "16px 18px 28px", background: "var(--panel)" }}>
        {CreatorRow}
        <div className="divider"></div>
        <div className="row between"><span className="eyebrow">The recipe</span><span className="mono dim3" style={{ fontSize: 11 }}>v1</span></div>
        {Recipe(1)}
        <button className="btn primary lg block" onClick={() => loadOntoMine(preset.tone)}>Load these onto my photo</button>
      </div>
    </div>
  );
}

/* ---------------- SHARE (S3 — receipt stub) ---------------- */
function Share({ tone, src, go, device, day = 128, theme = "Golden Hour Street", user }) {
  const dashed = { borderTop: "1px dashed var(--line-2)", margin: "2px 0" };
  const Row = ({ k, v }) => (
    <div className="row between mono" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}><span className="dim">{k}</span><span>{v}</span></div>
  );
  return (
    <div className="screen center" style={{ justifyContent: "center", padding: 24, gap: 18, background: "var(--bg)" }}>
      <div className="card" style={{ width: 290, padding: "22px 22px 24px", display: "flex", flexDirection: "column", gap: 13, fontFamily: "var(--mono)", boxShadow: "var(--shadow)" }}>
        <div className="col center" style={{ gap: 3 }}>
          <span style={{ letterSpacing: ".18em", fontWeight: 700, fontSize: 13 }}>COLOR·GRADLE</span>
          <span className="dim3" style={{ fontSize: 10.5, textTransform: "uppercase", textAlign: "center" }}>Day {day} — {theme}</span>
        </div>
        <div style={dashed}></div>
        <P3 tone={tone} src={src} radius="var(--r-xs)" style={{ width: "100%", aspectRatio: "1 / 1" }}></P3>
        <div style={dashed}></div>
        <Row k="PLAYER" v={(user || "ANONYMOUS").toUpperCase()} />
        <Row k="RANK" v="TOP 8%" />
        <Row k="LIKES" v="23 ♥" />
        <Row k="TIME" v="3:42" />
        <div style={dashed}></div>
        <span className="dim3" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>COLOR SIGNATURE</span>
        <SG3 tone={tone} n={6} />
        <div style={dashed}></div>
        <span className="dim3" style={{ fontSize: 9.5, textAlign: "center", letterSpacing: ".1em" }}>✦ NEXT PHOTO IN 06:14:22 ✦</span>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn" onClick={() => go("gallery")}>‹ Gallery</button>
        <button className="btn">Copy card</button>
        <button className="btn primary">Share</button>
      </div>
    </div>
  );
}

Object.assign(window, { Detail, Share });
