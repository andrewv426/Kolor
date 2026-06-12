/* ===================== EDITOR (5-min game) — 3 layout approaches ===================== */
const { Phone: EPhone, Desk: EDesk, Col: ECol, Photo: EPhoto, Slider: ESlider, Chip: EChip, Btn: EBtn, Badge: EBadge, Timer: ETimer, Note: ENote } = window;

const TOOLS = ["Temp", "Tint", "Expo", "Contr", "High", "Shad", "White", "Black", "Vib", "Sat"];
const FULL = [
  ["Temperature", 18], ["Tint", -6], ["Exposure", 12], ["Contrast", 22], ["Highlights", -40],
  ["Shadows", 35], ["Whites", 10], ["Blacks", -15], ["Vibrance", 28], ["Saturation", -5],
];

function EditTopBar({ desk }) {
  return (
    <div className="row between" style={{ padding: desk ? "12px 16px" : "12px 14px", position: "relative", zIndex: 3 }}>
      <span className="row" style={{ gap: 8 }}>
        <EBadge>DAY #128</EBadge>
        <span className="mono muted" style={{ fontSize: 10.5 }}>hold to compare</span>
      </span>
      <ETimer>4:38</ETimer>
    </div>
  );
}

/* E1 — photo fills; slider tray as a bottom sheet (one tool active) */
function EditSheet({ device }) {
  const desk = device === "desk";
  const sheet = (
    <div style={{ background: "var(--screen)", borderTop: "1.5px solid var(--stroke)", borderRadius: desk ? "0" : "18px 18px 0 0", padding: desk ? "14px 22px 18px" : "12px 14px 16px", display: "flex", flexDirection: "column", gap: 13 }}>
      {!desk && <div style={{ width: 38, height: 4, borderRadius: 99, background: "var(--line)", alignSelf: "center" }}></div>}
      <div className="row noscroll" style={{ gap: 7, overflowX: "auto", paddingBottom: 2 }}>
        {TOOLS.map((t, i) => <EChip key={t} on={i === 0}>{t}</EChip>)}
      </div>
      <div style={{ maxWidth: desk ? 620 : "none", width: "100%", margin: "0 auto" }}>
        <ESlider label="Temperature" v={18} />
      </div>
      <div className="row between" style={{ marginTop: 2 }}>
        <span className="row" style={{ gap: 8 }}>
          <EBtn ghost>⤺ Reset</EBtn>
          <EBtn ghost>◐ Before</EBtn>
        </span>
        <EBtn primary>Submit ⏎</EBtn>
      </div>
    </div>
  );
  const inner = (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <EPhoto label="LIVE EDIT PREVIEW" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
      <div className="scrim"></div>
      <EditTopBar desk={desk} />
      <div style={{ flex: 1 }}></div>
      <div style={{ position: "relative", zIndex: 3 }}>{sheet}</div>
    </div>
  );
  return desk ? <EDesk url="color-gradle.app/play">{inner}</EDesk> : <EPhone>{inner}</EPhone>;
}

/* E2 — photo on top, full scrollable slider list below (Lightroom-lite) */
function EditList({ device }) {
  const desk = device === "desk";
  if (desk) {
    return (
      <EDesk url="color-gradle.app/play">
        <div style={{ display: "flex", height: "100%" }}>
          <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column" }}>
            <EPhoto label="LIVE EDIT PREVIEW" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
            <div className="scrim"></div>
            <EditTopBar desk />
          </div>
          <div style={{ width: 286, borderLeft: "1.5px solid var(--line)", display: "flex", flexDirection: "column" }}>
            <div className="row between" style={{ padding: "12px 16px", borderBottom: "1.5px solid var(--line)" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Adjust</span><span className="mono muted" style={{ fontSize: 10 }}>10 sliders</span>
            </div>
            <div className="noscroll" style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              {FULL.map(([l, v]) => <ESlider key={l} label={l} v={v} mini />)}
            </div>
            <div style={{ padding: 14, borderTop: "1.5px solid var(--line)" }}><EBtn primary block>Submit edit ⏎</EBtn></div>
          </div>
        </div>
      </EDesk>
    );
  }
  return (
    <EPhone>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ position: "relative", height: 250, flex: "0 0 auto" }}>
          <EPhoto label="LIVE EDIT PREVIEW" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
          <div className="scrim"></div>
          <EditTopBar />
        </div>
        <div className="noscroll" style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {FULL.map(([l, v]) => <ESlider key={l} label={l} v={v} mini />)}
        </div>
        <div style={{ padding: 12, borderTop: "1.5px solid var(--line)" }} className="row between">
          <EBtn ghost>⤺ Reset</EBtn><EBtn primary>Submit ⏎</EBtn>
        </div>
      </div>
    </EPhone>
  );
}

/* E3 — single big slider + horizontal tool reel (Wordle-simple, one control at a time) */
function EditReel({ device }) {
  const desk = device === "desk";
  const controls = (
    <div style={{ background: "var(--screen)", padding: desk ? "20px 26px 22px" : "16px 14px 18px", borderTop: "1.5px solid var(--stroke)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ maxWidth: desk ? 560 : "none", width: "100%", margin: "0 auto", textAlign: "center" }}>
        <div className="mono muted" style={{ fontSize: 11, letterSpacing: ".1em" }}>EXPOSURE</div>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: desk ? 34 : 28, margin: "2px 0 14px" }}>+12</div>
        <div className="s-track" style={{ height: 6 }}>
          <span className="s-fill" style={{ left: "50%", width: "6%" }}></span>
          <span className="s-knob" style={{ left: "56%", width: 22, height: 22 }}></span>
        </div>
      </div>
      <div className="row noscroll" style={{ gap: 9, overflowX: "auto", justifyContent: desk ? "center" : "flex-start", padding: "2px 0" }}>
        {TOOLS.map((t, i) => (
          <span key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 46 }}>
            <span style={{ width: 38, height: 38, borderRadius: "50%", border: "1.5px solid " + (i === 2 ? "var(--stroke)" : "var(--line)"), background: i === 2 ? "var(--accent-soft)" : "var(--screen)" }}></span>
            <span className="mono" style={{ fontSize: 9, color: i === 2 ? "var(--ink)" : "var(--ink2)" }}>{t}</span>
          </span>
        ))}
      </div>
    </div>
  );
  const inner = (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <EPhoto label="LIVE EDIT PREVIEW" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
      <div className="scrim"></div>
      <EditTopBar desk={desk} />
      <div style={{ flex: 1 }}></div>
      <div className="row between" style={{ position: "relative", zIndex: 3, padding: "0 14px 12px" }}>
        <EBtn ghost>◐ Before</EBtn><EBtn primary>Submit ⏎</EBtn>
      </div>
      <div style={{ position: "relative", zIndex: 3 }}>{controls}</div>
    </div>
  );
  return desk ? <EDesk url="color-gradle.app/play">{inner}</EDesk> : <EPhone>{inner}</EPhone>;
}

function EditorScreen({ device }) {
  return (
    <>
      <ECol id="E1 · Bottom-sheet tray" sub="Photo fills the screen; a tool chip-row + the active slider live in a sheet. Most immersive.">
        <EditSheet device={device} />
      </ECol>
      <ECol id="E2 · Full slider list" sub="Photo pinned on top, all 10 labelled sliders scroll below. Familiar, fast for power users.">
        <EditList device={device} />
      </ECol>
      <ECol id="E3 · One-at-a-time reel" sub="Wordle-simple: photo dominates, one giant slider, a tap-a-tool reel. Lowest cognitive load.">
        <EditReel device={device} />
      </ECol>
    </>
  );
}
window.EditorScreen = EditorScreen;
