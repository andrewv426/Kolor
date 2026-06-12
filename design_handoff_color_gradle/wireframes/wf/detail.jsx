/* ===================== EDIT DETAIL / INSPECT SETTINGS — 3 approaches ===================== */
const { Phone: DPhone, Desk: DDesk, Col: DCol, Photo: DPhoto, Slider: DSlider, Badge: DBadge, Btn: DBtn, Av: DAv, Note: DNote } = window;

const RECIPE = [
  ["Temperature", 18], ["Tint", -6], ["Exposure", 12], ["Contrast", 22], ["Highlights", -40],
  ["Shadows", 35], ["Whites", 10], ["Blacks", -15], ["Vibrance", 28], ["Saturation", -5],
];

function CreatorRow({ ai }) {
  return (
    <div className="row between">
      <span className="row" style={{ gap: 9 }}>
        <DAv />
        {ai ? <DBadge ai>AI · claude-opus-4.8</DBadge> : <span style={{ fontWeight: 600, fontSize: 13 }}>CrimsonOtter47</span>}
      </span>
      <DBtn ghost>♡ 71</DBtn>
    </div>
  );
}

/* D1 — photo on top, full recipe below */
function DetailRecipe({ device }) {
  const desk = device === "desk";
  const body = (
    <>
      <div style={{ position: "relative" }}>
        <DPhoto label="THEIR EDIT" h={desk ? 240 : 210} style={{ borderRadius: 0 }} />
        <span style={{ position: "absolute", bottom: 8, left: 8 }} className="badge fill">HOLD TO SEE ORIGINAL</span>
      </div>
      <div style={{ padding: desk ? "16px 22px" : "14px 16px", display: "flex", flexDirection: "column", gap: 13 }}>
        <CreatorRow ai />
        <div className="row between"><span className="mono muted" style={{ fontSize: 11, letterSpacing: ".08em" }}>THE RECIPE · 10 SLIDERS</span><span className="mono muted" style={{ fontSize: 10 }}>v1</span></div>
        <div className="wgrid" style={{ gridTemplateColumns: desk ? "1fr 1fr" : "1fr", gap: desk ? "11px 22px" : 11 }}>
          {RECIPE.map(([l, v]) => <DSlider key={l} label={l} v={v} mini />)}
        </div>
        <DBtn primary block>↧ Load these onto my photo</DBtn>
      </div>
    </>
  );
  const inner = desk ? body : <div className="noscroll" style={{ flex: 1, overflowY: "auto" }}>{body}</div>;
  return desk ? <DDesk url="color-gradle.app/edit/8f2">{inner}</DDesk> : <DPhone>{inner}</DPhone>;
}

/* D2 — side-by-side compare (theirs vs yours) */
function DetailCompare({ device }) {
  const desk = device === "desk";
  const compareTop = (
    <div style={{ display: "flex", gap: 2 }}>
      <div style={{ flex: 1, position: "relative" }}><DPhoto label="THEIRS" h={desk ? 220 : 170} style={{ borderRadius: 0 }} /><span style={{ position: "absolute", top: 6, left: 6 }} className="badge">THEIRS</span></div>
      <div style={{ flex: 1, position: "relative" }}><DPhoto label="YOURS" h={desk ? 220 : 170} style={{ borderRadius: 0 }} /><span style={{ position: "absolute", top: 6, left: 6 }} className="badge fill">YOURS</span></div>
    </div>
  );
  const chips = (
    <div style={{ padding: desk ? "16px 22px" : "13px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <CreatorRow ai={false} />
      <span className="mono muted" style={{ fontSize: 11, letterSpacing: ".08em" }}>WHERE THEY DIFFER FROM YOU</span>
      <div className="row" style={{ flexWrap: "wrap", gap: 7 }}>
        {[["Exposure", "+12 vs +4"], ["Shadows", "+35 vs −10"], ["Vibrance", "+28 vs +8"], ["Temp", "+18 vs 0"], ["Highlights", "−40 vs −12"]].map(([a, b]) => (
          <span key={a} className="chip on" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, borderRadius: "var(--radius-sm)" }}>
            <span style={{ fontSize: 11 }}>{a}</span><span className="mono" style={{ fontSize: 9.5, color: "var(--ink2)" }}>{b}</span>
          </span>
        ))}
      </div>
      <DBtn primary block>↧ Load theirs to compare live</DBtn>
    </div>
  );
  const inner = <div className="noscroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>{compareTop}{chips}</div>;
  return desk ? <DDesk url="color-gradle.app/edit/8f2">{inner}</DDesk> : <DPhone>{inner}</DPhone>;
}

/* D3 — settings-forward (recipe is the hero) */
function DetailSettingsFirst({ device }) {
  const desk = device === "desk";
  if (desk) {
    return (
      <DDesk url="color-gradle.app/edit/8f2">
        <div style={{ display: "flex", height: "100%" }}>
          <div style={{ width: 340, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 13, borderRight: "1.5px solid var(--line)" }}>
            <CreatorRow ai />
            <DPhoto label="THEIR EDIT" h={170} style={{ borderRadius: "var(--radius-sm)" }} />
            <DNote>tap a value to copy just that one slider</DNote>
          </div>
          <div style={{ flex: 1, padding: "20px 26px", display: "flex", flexDirection: "column", gap: 13 }}>
            <div className="row between"><span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 22 }}>The recipe</span><DBtn primary>↧ Load all</DBtn></div>
            <div className="wgrid" style={{ gridTemplateColumns: "1fr 1fr", gap: "13px 26px" }}>
              {RECIPE.map(([l, v]) => <DSlider key={l} label={l} v={v} mini />)}
            </div>
          </div>
        </div>
      </DDesk>
    );
  }
  return (
    <DPhone>
      <div className="noscroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px 10px", display: "flex", flexDirection: "column", gap: 12 }}>
          <CreatorRow ai />
          <DPhoto label="THEIR EDIT" h={120} style={{ borderRadius: "var(--radius-sm)" }} />
          <div className="row between"><span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18 }}>The recipe</span><span className="mono muted" style={{ fontSize: 10 }}>tap to copy</span></div>
        </div>
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {RECIPE.map(([l, v]) => <DSlider key={l} label={l} v={v} mini />)}
          <DBtn primary block>↧ Load all onto my photo</DBtn>
        </div>
      </div>
    </DPhone>
  );
}

function DetailScreen({ device }) {
  return (
    <>
      <DCol id="D1 · Photo + recipe" sub="Big edit on top, the full 10-slider recipe as read-only sliders below. One-tap 'load onto mine'.">
        <DetailRecipe device={device} />
      </DCol>
      <DCol id="D2 · Side-by-side" sub="Theirs vs yours up top, then only the sliders where you differ. Built to learn from.">
        <DetailCompare device={device} />
      </DCol>
      <DCol id="D3 · Recipe-forward" sub="The settings ARE the page — values are the hero, photo is supporting. For the tinkerers.">
        <DetailSettingsFirst device={device} />
      </DCol>
    </>
  );
}
window.DetailScreen = DetailScreen;
