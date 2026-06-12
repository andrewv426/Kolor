/* ===================== SUBMIT → REVEAL transition — 3 approaches ===================== */
const { Phone: RPhone, Desk: RDesk, Col: RCol, Photo: RPhoto, Btn: RBtn, Badge: RBadge, Bars: RBars, Note: RNote } = window;

function RWrap({ device, children, url = "color-gradle.app/play" }) {
  return device === "desk" ? <RDesk url={url}>{children}</RDesk> : <RPhone>{children}</RPhone>;
}

/* R1 — confirm sheet (the commit) */
function RevealConfirm({ device }) {
  return (
    <RWrap device={device}>
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
        <RPhoto label="YOUR EDIT" style={{ position: "absolute", inset: 0, borderRadius: 0, filter: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(20,18,14,.45)" }}></div>
        <div style={{ flex: 1 }}></div>
        <div style={{ position: "relative", background: "var(--screen)", borderRadius: device === "desk" ? "var(--radius)" : "20px 20px 0 0", margin: device === "desk" ? "auto" : 0, width: device === "desk" ? 380 : "auto", padding: "20px 18px 18px", display: "flex", flexDirection: "column", gap: 14, textAlign: "center", alignItems: "center" }}>
          <RPhoto label="THUMB" h={84} style={{ width: 84, borderRadius: "var(--radius-sm)" }} />
          <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 19 }}>Lock it in?</div>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>You can't re-edit today's photo once you submit.</p>
          <div style={{ display: "flex", gap: 9, width: "100%", marginTop: 2 }}>
            <RBtn block ghost>Keep editing</RBtn>
            <RBtn block primary>Lock &amp; reveal</RBtn>
          </div>
        </div>
      </div>
    </RWrap>
  );
}

/* R2 — full-screen "unlocking" payoff beat */
function RevealUnlocking({ device }) {
  return (
    <RWrap device={device}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 26, textAlign: "center" }}>
        <div style={{ position: "relative" }}>
          <RPhoto label="YOUR EDIT" h={device === "desk" ? 180 : 150} style={{ width: device === "desk" ? 180 : 150, borderRadius: "var(--radius)" }} />
          <span style={{ position: "absolute", inset: -7, border: "1.5px dashed var(--accent)", borderRadius: "calc(var(--radius) + 6px)" }}></span>
        </div>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: device === "desk" ? 26 : 21 }}>Unlocking today's gallery…</div>
        <div style={{ width: device === "desk" ? 240 : 180 }}>
          <div className="s-track" style={{ height: 5 }}><span className="s-fill" style={{ left: 0, width: "66%", opacity: 1 }}></span></div>
        </div>
        <span className="pill"><span className="dotlive"></span>312 edits waiting</span>
        <RNote>does real work: bakes share card, fires gallery query (1–2s)</RNote>
      </div>
    </RWrap>
  );
}

/* R3 — inline morph (least interruptive) */
function RevealInline({ device }) {
  return (
    <RWrap device={device}>
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* gallery faintly sliding in behind */}
        <div className="wgrid" style={{ position: "absolute", inset: 0, gridTemplateColumns: "1fr 1fr", gap: 8, padding: 14, opacity: .28 }}>
          {Array.from({ length: 6 }).map((_, i) => <RPhoto key={i} label="" h={120} style={{ borderRadius: "var(--radius-sm)" }} />)}
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,var(--screen) 30%,transparent)" }}></div>
        <div style={{ flex: 1 }}></div>
        <div style={{ position: "relative", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row center" style={{ gap: 8 }}>
            <RBadge>✓ LOCKED</RBadge>
            <span className="mono muted" style={{ fontSize: 11 }}>your edit is in</span>
          </div>
          <div className="s-track" style={{ height: 4 }}><span className="s-fill" style={{ left: 0, width: "80%", opacity: 1 }}></span></div>
          <RBtn primary block lg>See everyone's edits ↓</RBtn>
        </div>
      </div>
    </RWrap>
  );
}

function RevealScreen({ device }) {
  return (
    <>
      <RCol id="R1 · Confirm sheet" sub="Explicit commit: 'Lock it in?' with your thumb. Clear, reversible until the tap.">
        <RevealConfirm device={device} />
      </RCol>
      <RCol id="R2 · Unlocking beat" sub="Full-screen 1–2s payoff while real work runs. Maximises the dopamine of the reveal.">
        <RevealUnlocking device={device} />
      </RCol>
      <RCol id="R3 · Inline morph" sub="Submit button becomes 'Locked', gallery slides up behind. Tightest, least interruptive loop.">
        <RevealInline device={device} />
      </RCol>
    </>
  );
}
window.RevealScreen = RevealScreen;
