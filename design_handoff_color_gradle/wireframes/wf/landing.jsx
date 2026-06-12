/* ===================== LANDING ("Today") — 3 approaches ===================== */
const { Phone, Desk, Col, Photo, Btn, Badge, Pill, Live, Bars, Swatches, Note } = window;

/* A1 — full-bleed photo hero */
function LandingFullbleed({ device }) {
  const inner = (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <Photo label="TODAY'S UNEDITED PHOTO" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
      <div className="scrim"></div>
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: device === "desk" ? "22px 26px" : "16px 16px" }}>
        <Badge fill>DAY #128</Badge>
        <Live />
      </div>
      <div style={{ flex: 1 }}></div>
      <div style={{ position: "relative", padding: device === "desk" ? "0 40px 40px" : "0 16px 22px", color: "#fff", maxWidth: device === "desk" ? 520 : "none" }}>
        <div className="mono" style={{ fontSize: 11, opacity: .85, letterSpacing: ".08em" }}>TODAY'S THEME</div>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: device === "desk" ? 40 : 27, lineHeight: 1.05, margin: "7px 0 16px" }}>Golden Hour Street</div>
        <Btn primary block={device !== "desk"} lg>▶ &nbsp;Play today's photo</Btn>
        <div style={{ marginTop: 12, color: "#fff", opacity: .85, fontSize: 12 }} className="mono">5:00 on the clock · no login</div>
      </div>
    </div>
  );
  return device === "desk" ? <Desk>{inner}</Desk> : <Phone>{inner}</Phone>;
}

/* A2 — centered card (Wordle-simple) */
function LandingCard({ device }) {
  const card = (
    <div style={{ width: device === "desk" ? 420 : "100%", border: "1.5px solid var(--line)", borderRadius: "var(--radius)", background: "var(--screen)", padding: 22, display: "flex", flexDirection: "column", gap: 15, alignItems: "center", textAlign: "center", boxShadow: "0 8px 22px -16px rgba(0,0,0,.3)" }}>
      <div className="row between" style={{ width: "100%" }}>
        <Badge>DAY #128</Badge><Live />
      </div>
      <Photo label="PHOTO" h={device === "desk" ? 190 : 150} style={{ width: "100%", borderRadius: "var(--radius-sm)" }} />
      <div className="mono muted" style={{ fontSize: 11, letterSpacing: ".06em" }}>GOLDEN HOUR STREET</div>
      <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 21 }}>Edit it your way.</div>
      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>5 minutes · 10 sliders · submit to unlock everyone's edits.</p>
      <Btn primary block lg>Play today's photo</Btn>
    </div>
  );
  const inner = (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: device === "desk" ? 30 : 18, gap: 20 }}>
      <div className="row" style={{ gap: 9 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent),var(--hatch2))" }}></span>
        <span style={{ fontWeight: 800, letterSpacing: "-.01em" }}>color-gradle</span>
      </div>
      {card}
    </div>
  );
  return device === "desk" ? <Desk>{inner}</Desk> : <Phone>{inner}</Phone>;
}

/* A3 — editorial split / "daily edition" */
function LandingEditorial({ device }) {
  if (device === "desk") {
    return (
      <Desk>
        <div style={{ display: "flex", height: "100%" }}>
          <div style={{ width: 360, padding: "40px 34px", display: "flex", flexDirection: "column", borderRight: "1.5px solid var(--line)" }}>
            <div className="row between"><span style={{ fontWeight: 800 }}>color-gradle</span><Live /></div>
            <div style={{ flex: 1 }}></div>
            <div className="mono muted" style={{ fontSize: 11, letterSpacing: ".1em" }}>DAY #128 · 02 JUN 2026</div>
            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 38, lineHeight: 1.05, margin: "10px 0 14px" }}>Golden Hour Street</div>
            <Bars widths={[100, 88, 60]} />
            <Btn primary lg>Play today's photo →</Btn>
            <div style={{ flex: 1 }}></div>
            <Note>returning player: shows your edit + countdown</Note>
          </div>
          <Photo label="TODAY'S UNEDITED PHOTO" style={{ flex: 1, borderRadius: 0 }} />
        </div>
      </Desk>
    );
  }
  return (
    <Phone>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 16px 12px" }}>
          <div className="row between"><span style={{ fontWeight: 800 }}>color-gradle</span><Live /></div>
          <div className="divline" style={{ margin: "12px 0" }}></div>
          <div className="mono muted" style={{ fontSize: 10.5, letterSpacing: ".1em" }}>DAY #128 · 02 JUN 2026</div>
          <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 26, lineHeight: 1.06, margin: "6px 0 0" }}>Golden Hour Street</div>
        </div>
        <Photo label="TODAY'S UNEDITED PHOTO" style={{ flex: 1, borderRadius: 0 }} />
        <div style={{ padding: 16 }}>
          <Btn primary block lg>Play today's photo →</Btn>
        </div>
      </div>
    </Phone>
  );
}

function LandingScreen({ device }) {
  return (
    <>
      <Col id="A1 · Full-bleed hero" sub="Photo is the whole screen; meta + one CTA float on top. Maximum drama.">
        <LandingFullbleed device={device} />
      </Col>
      <Col id="A2 · Centered card" sub="Wordle-simple. Lots of calm whitespace, one tidy card, photo as a thumb.">
        <LandingCard device={device} />
      </Col>
      <Col id="A3 · Daily edition" sub="Editorial split — masthead meta beside the photo. Feels like a daily publication.">
        <LandingEditorial device={device} />
      </Col>
    </>
  );
}
window.LandingScreen = LandingScreen;
