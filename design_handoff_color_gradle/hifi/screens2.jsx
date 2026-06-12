/* ===================== HI-FI SCREENS · Reveal + Gallery ===================== */
const { useState: u2S } = React;
const { Photo: P2, Heart: HT, Av: AV } = window;

/* ---------------- REVEAL (R1 — confirm sheet) ---------------- */
function Reveal({ tone, src, go, device, onLock }) {
  const sheet = (
    <div className="sheet" style={{ position: "relative", padding: "22px 20px 24px", width: device === "desktop" ? 400 : "auto", borderRadius: device === "desktop" ? "var(--r)" : "22px 22px 0 0", border: device === "desktop" ? "1px solid var(--line-2)" : undefined }}>
      {device !== "desktop" && <div style={{ width: 38, height: 4, borderRadius: 99, background: "var(--line-2)", margin: "0 auto 18px" }}></div>}
      <div className="col center" style={{ gap: 16, textAlign: "center" }}>
        <P2 tone={tone} src={src} radius="var(--r-sm)" style={{ width: 96, height: 120 }}></P2>
        <div className="col" style={{ gap: 7 }}>
          <span className="h-md">Lock it in?</span>
          <span className="dim" style={{ fontSize: 14.5 }}>You can't re-edit today's photo once you submit. Your look joins the gallery.</span>
        </div>
        <div className="row" style={{ gap: 10, width: "100%", marginTop: 4 }}>
          <button className="btn fill1" onClick={() => go("editor")}>Keep editing</button>
          <button className="btn primary fill1" onClick={() => (onLock || (() => go("gallery")))()}>Lock &amp; reveal</button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="screen">
      <P2 tone={tone} src={src} style={{ position: "absolute", inset: 0 }}></P2>
      <div style={{ position: "absolute", inset: 0, background: "rgba(8,7,6,.62)", backdropFilter: "blur(2px)" }}></div>
      <div className="col" style={{ position: "relative", minHeight: "100vh", justifyContent: device === "desktop" ? "center" : "flex-end", alignItems: "center" }}>
        {sheet}
      </div>
    </div>
  );
}

/* ---------------- GALLERY (G1) ---------------- */
const SORTS = ["Top", "New"];
function sortPresets(list, mode) {
  const a = [...list];
  if (mode === "Top") return a.sort((x, y) => y.likes - x.likes);
  if (mode === "New") return a.reverse();
  const dist = (p) => Object.values(p.tone).reduce((s, v) => s + Math.abs(v), 0);
  return a.sort((x, y) => dist(y) - dist(x));
}

function Gallery({ tone, src, presets, liked, toggleLike, openDetail, go, device, early, user }) {
  const [sort, setSort] = u2S("Top");
  const full = sortPresets(presets, sort);
  const list = early ? full.slice(0, 4) : full;
  const cols = device === "desktop" ? 4 : 2;
  const count = early ? 12 : presets.length * 35 + 12;

  const Header = (
    <div className="col" style={{ gap: 14, padding: device === "desktop" ? "26px 32px 18px" : "18px 18px 14px", position: "sticky", top: 0, background: "var(--bg)", zIndex: 4, borderBottom: "1px solid var(--line)" }}>
      <div className="row between">
        <div className="col" style={{ gap: 3 }}>
          <span className="h-md">Today's gallery</span>
          <span className="dim" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{count.toLocaleString()} edits{sort === "Top" ? " · by likes" : ""}</span>
        </div>
        <button className="btn ghost sm" onClick={() => go("share")}>Your result</button>
      </div>
      <div className="tabset" style={{ alignSelf: "flex-start" }}>{SORTS.map((s) => <span key={s} className={"t" + (s === sort ? " on" : "")} onClick={() => setSort(s)}>{s}</span>)}</div>
      {early ? <div className="row" style={{ gap: 9, padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)" }}><span style={{ fontSize: 13, color: "var(--ink-2)" }}>You're early. Only a few edits so far — more roll in through the day.</span></div> : null}
    </div>
  );

  const You = (
    <div className="row between" style={{ margin: device === "desktop" ? "18px 32px" : "14px 18px", padding: "12px 14px", borderRadius: "var(--r-sm)", background: "color-mix(in srgb,var(--accent) 7%,var(--panel))", border: "1px solid color-mix(in srgb,var(--accent) 22%,transparent)" }}>
      <div className="row" style={{ gap: 12 }}>
        <P2 tone={tone} src={src} radius="8px" style={{ width: 46, height: 46 }}></P2>
        <div className="col" style={{ gap: 3 }}>
          <span className="row" style={{ gap: 8 }}><span className="badge accent">YOU</span><span className="mono" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{user || "Anonymous"}</span></span>
          <span className="dim" style={{ fontSize: 13, whiteSpace: "nowrap" }}>Top 8% · 23 likes</span>
        </div>
      </div>
      <button className="btn sm" onClick={() => go("share")}>Share</button>
    </div>
  );

  const Grid = (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, padding: device === "desktop" ? "0 32px 110px" : "0 18px 110px" }}>
      {list.map((p) => {
        const isLiked = liked.has(p.id);
        return (
          <div key={p.id} className="tile" onClick={() => openDetail(p)}>
            <P2 tone={p.tone} src={src} style={{ aspectRatio: "1 / 1" }}>
              {p.ai ? <span className="corner" style={{ left: 7 }}><span className="badge ai">AI</span></span> : null}
              <div className="scrim soft"></div>
              <div className="tmeta">
                <span className="row" style={{ gap: 6, minWidth: 0 }}>
                  <AV />
                  <span className="mono" style={{ fontSize: 10.5, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.ai ? p.name : p.handle}</span>
                </span>
                <span onClick={(e) => { e.stopPropagation(); toggleLike(p.id); }} className="heart" style={{ color: isLiked ? "var(--accent)" : "#fff", cursor: "pointer" }}>
                  {isLiked ? "♥" : "♡"} {p.likes + (isLiked ? 1 : 0)}
                </span>
              </div>
            </P2>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="screen" style={{ overflowY: "auto" }}>
      {Header}{You}{Grid}
    </div>
  );
}

Object.assign(window, { Reveal, Gallery });
