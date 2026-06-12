/* ===================== REVEAL GALLERY — 3 approaches ===================== */
const { Phone: GPhone, Desk: GDesk, Col: GCol, Photo: GPhoto, Tile: GTile, Badge: GBadge, Btn: GBtn, Av: GAv, Heart: GHeart, Note: GNote } = window;

function SortTabs({ active = 0 }) {
  const t = ["Top", "New", "Surprising"];
  return <div className="sorttabs">{t.map((x, i) => <span key={x} className={"sorttab" + (i === active ? " on" : "")}>{x}</span>)}</div>;
}
const GAL = [
  { n: 84, ai: false }, { n: 71, ai: true, name: "claude-opus-4.8" }, { n: 63, ai: false },
  { n: 52, ai: false }, { n: 49, ai: true, name: "gemini-3-pro" }, { n: 41, ai: false },
  { n: 38, ai: false }, { n: 33, ai: true, name: "gpt-5.4" }, { n: 29, ai: false },
];

/* G1 — uniform grid + pinned You strip */
function GalleryGrid({ device }) {
  const desk = device === "desk";
  const head = (
    <div style={{ padding: desk ? "14px 22px" : "12px 14px", borderBottom: "1.5px solid var(--line)", display: "flex", flexDirection: "column", gap: 11, background: "var(--screen)" }}>
      <div className="row between">
        <span style={{ fontWeight: 700, fontSize: 14 }}>Today's gallery</span>
        <span className="mono muted" style={{ fontSize: 11 }}>312 edits</span>
      </div>
      <SortTabs />
    </div>
  );
  const youStrip = (
    <div style={{ padding: desk ? "12px 22px" : "10px 14px", background: "var(--accent-soft)", borderBottom: "1.5px solid var(--line)" }} className="row between">
      <span className="row" style={{ gap: 9 }}><GBadge fill>YOU</GBadge><GPhoto label="" h={40} style={{ width: 40, borderRadius: 6 }} /><span className="mono" style={{ fontSize: 11 }}>Top 8% · 23 ♡</span></span>
      <GBtn ghost>View →</GBtn>
    </div>
  );
  const grid = (
    <div className="noscroll wgrid" style={{ flex: 1, overflowY: "auto", padding: desk ? 18 : 12, gridTemplateColumns: desk ? "repeat(4,1fr)" : "1fr 1fr", alignContent: "start" }}>
      {GAL.map((g, i) => <GTile key={i} h={desk ? 110 : 92} ai={g.ai} name={desk ? g.name : null} n={g.n} />)}
    </div>
  );
  const inner = <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{head}{youStrip}{grid}</div>;
  return desk ? <GDesk url="color-gradle.app/gallery">{inner}</GDesk> : <GPhone>{inner}</GPhone>;
}

/* G2 — social feed (one big tile at a time) */
function GalleryFeed({ device }) {
  const desk = device === "desk";
  const card = (g, i) => (
    <div key={i} style={{ border: "1.5px solid var(--line)", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--screen)" }}>
      <div className="row between" style={{ padding: "9px 12px" }}>
        <span className="row" style={{ gap: 8 }}><GAv />{g.ai ? <GBadge ai>AI · {g.name}</GBadge> : <span className="mono" style={{ fontSize: 11 }}>CrimsonOtter47</span>}</span>
        <span className="mono muted" style={{ fontSize: 10 }}>#{i + 1}</span>
      </div>
      <GPhoto label="EDIT" h={desk ? 230 : 190} style={{ borderRadius: 0 }} />
      <div className="row between" style={{ padding: "9px 12px" }}>
        <GBtn ghost>♡ Like</GBtn><span className="mono muted" style={{ fontSize: 11 }}>{g.n} likes · tap to inspect</span>
      </div>
    </div>
  );
  const inner = (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="row between" style={{ padding: desk ? "14px 22px" : "12px 14px", borderBottom: "1.5px solid var(--line)" }}>
        <SortTabs /><span className="mono muted" style={{ fontSize: 11 }}>312</span>
      </div>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto", padding: desk ? "18px 0" : 14, display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <div style={{ width: desk ? 460 : "100%", display: "flex", flexDirection: "column", gap: 14 }}>
          {GAL.slice(0, 3).map((g, i) => card(g, i))}
        </div>
      </div>
    </div>
  );
  return desk ? <GDesk url="color-gradle.app/gallery">{inner}</GDesk> : <GPhone>{inner}</GPhone>;
}

/* G3 — comparison-forward (everything measured against your edit) */
function GalleryCompare({ device }) {
  const desk = device === "desk";
  const grid = (
    <div className="noscroll wgrid" style={{ flex: 1, overflowY: "auto", padding: desk ? 18 : 12, gridTemplateColumns: desk ? "repeat(3,1fr)" : "1fr 1fr", alignContent: "start" }}>
      {GAL.map((g, i) => (
        <div key={i} className="tile">
          <div style={{ position: "relative" }}>
            <GPhoto label="EDIT" h={desk ? 120 : 96} style={{ borderRadius: 0 }} />
            <span style={{ position: "absolute", top: 5, right: 5 }} className="badge">{["Δ72", "Δ65", "Δ58", "Δ44", "Δ40", "Δ31", "Δ22", "Δ18", "Δ9"][i] + "% vs you"}</span>
            {g.ai ? <span style={{ position: "absolute", top: 5, left: 5 }}><GBadge ai>AI</GBadge></span> : null}
          </div>
          <div className="meta"><GHeart n={g.n} /><span className="mono muted" style={{ fontSize: 9 }}>inspect</span></div>
        </div>
      ))}
    </div>
  );
  if (desk) {
    return (
      <GDesk url="color-gradle.app/gallery">
        <div style={{ display: "flex", height: "100%" }}>
          <div style={{ width: 220, borderRight: "1.5px solid var(--line)", padding: "16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Your edit</span>
            <GPhoto label="YOU" h={130} style={{ borderRadius: "var(--radius-sm)" }} />
            <div className="divline"></div>
            <span className="mono muted" style={{ fontSize: 10, letterSpacing: ".08em" }}>SORT</span>
            <SortTabs active={2} />
            <GNote>"Surprising" = most different from the median edit</GNote>
          </div>
          {grid}
        </div>
      </GDesk>
    );
  }
  return (
    <GPhone>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="row between" style={{ padding: "10px 14px", background: "var(--accent-soft)", borderBottom: "1.5px solid var(--line)" }}>
          <span className="row" style={{ gap: 8 }}><span className="mono" style={{ fontSize: 10.5 }}>vs</span><GBadge fill>YOUR EDIT</GBadge></span>
          <SortTabs active={2} />
        </div>
        {grid}
      </div>
    </GPhone>
  );
}

function GalleryScreen({ device }) {
  return (
    <>
      <GCol id="G1 · Uniform grid" sub="Even tiles, your edit pinned in a highlighted strip, sort tabs on top. Scannable & dense.">
        <GalleryGrid device={device} />
      </GCol>
      <GCol id="G2 · Social feed" sub="One large edit at a time with creator + like button. Familiar, lingering, good for AI reveals.">
        <GalleryFeed device={device} />
      </GCol>
      <GCol id="G3 · Comparison-first" sub="Every edit measured against yours (Δ% different). Leans into 'how did THEY do it?'.">
        <GalleryCompare device={device} />
      </GCol>
    </>
  );
}
window.GalleryScreen = GalleryScreen;
