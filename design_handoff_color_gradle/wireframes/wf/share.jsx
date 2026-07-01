/* ===================== RESULT / SHARE CARD — 3 approaches ===================== */
const { Phone: SPhone, Desk: SDesk, Col: SCol, Photo: SPhoto, Badge: SBadge, Btn: SBtn, Swatches: SSwatches, Note: SNote } = window;

function Countdown() {
  return <span className="mono muted" style={{ fontSize: 11 }}>next photo in 06:14:22</span>;
}

/* S1 — Wordle-style square card */
function ShareSquare({ device }) {
  const card = (
    <div style={{ width: device === "desk" ? 360 : "100%", maxWidth: 360, border: "1.5px solid var(--stroke)", borderRadius: "var(--radius)", background: "var(--screen)", overflow: "hidden" }}>
      <div className="row between" style={{ padding: "12px 14px", borderBottom: "1.5px solid var(--line)" }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>color-gradle</span><SBadge>DAY #128</SBadge>
      </div>
      <SPhoto label="YOUR EDIT" h={170} style={{ borderRadius: 0 }} />
      <div style={{ padding: "13px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
        <div className="row between">
          <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 17 }}>#3 of 9</span>
          <span className="mono" style={{ fontSize: 12 }}>23 ♡</span>
        </div>
        <div>
          <span className="mono muted" style={{ fontSize: 10, letterSpacing: ".08em" }}>COLOR SIGNATURE</span>
          <div style={{ marginTop: 6 }}><SSwatches n={6} /></div>
        </div>
      </div>
    </div>
  );
  return (
    <SWrap device={device}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: device === "desk" ? 30 : 18 }}>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 19 }}>Locked in. Nice eye.</div>
        {card}
        <div style={{ display: "flex", gap: 9, width: device === "desk" ? 360 : "100%", maxWidth: 360 }}>
          <SBtn block>Copy card</SBtn><SBtn block primary>Share ↗</SBtn>
        </div>
        <Countdown />
      </div>
    </SWrap>
  );
}

/* S2 — tall story card (9:16 social) */
function ShareStory({ device }) {
  const card = (
    <div style={{ width: 230, height: 408, borderRadius: "var(--radius)", border: "1.5px solid var(--stroke)", overflow: "hidden", position: "relative" }}>
      <SPhoto label="YOUR EDIT" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(20,18,14,.62),transparent 45%)" }}></div>
      <div className="row between" style={{ position: "relative", padding: 12 }}>
        <SBadge fill>color-gradle</SBadge><SBadge fill>DAY #128</SBadge>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 14, color: "#fff", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 24, lineHeight: 1.05 }}>Golden Hour Street</div>
        <div className="mono" style={{ fontSize: 11, opacity: .9 }}>my edit · top 8% · 23 ♡</div>
        <SSwatches n={6} />
      </div>
    </div>
  );
  return (
    <SWrap device={device}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15, padding: 18 }}>
        <span className="mono muted" style={{ fontSize: 11, letterSpacing: ".08em" }}>SPOILER-SAFE · 9:16 FOR STORIES</span>
        {card}
        <div style={{ display: "flex", gap: 9 }}>
          <SBtn>Save image</SBtn><SBtn primary>Share to story ↗</SBtn>
        </div>
        <Countdown />
      </div>
    </SWrap>
  );
}

/* S3 — minimal receipt stub */
function ShareReceipt({ device }) {
  const dash = { borderTop: "1.5px dashed var(--line)" };
  const card = (
    <div style={{ width: 250, background: "var(--screen)", border: "1.5px solid var(--stroke)", padding: "18px 18px 20px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "'JetBrains Mono',monospace" }}>
      <div style={{ textAlign: "center", letterSpacing: ".12em", fontWeight: 700, fontSize: 12 }}>COLOR-GRADLE</div>
      <div style={{ textAlign: "center", fontSize: 10, color: "var(--ink2)" }}>DAY #128 · GOLDEN HOUR ST.</div>
      <div style={dash}></div>
      <SPhoto label="EDIT" h={88} style={{ borderRadius: 0 }} />
      <div style={dash}></div>
      <div className="row between" style={{ fontSize: 11 }}><span style={{ color: "var(--ink2)" }}>RANK</span><span>#3 OF 9</span></div>
      <div className="row between" style={{ fontSize: 11 }}><span style={{ color: "var(--ink2)" }}>LIKES</span><span>23 ♡</span></div>
      <div className="row between" style={{ fontSize: 11 }}><span style={{ color: "var(--ink2)" }}>TIME</span><span>3:42</span></div>
      <div style={dash}></div>
      <div style={{ fontSize: 9, color: "var(--ink2)" }}>COLOR SIGNATURE</div>
      <SSwatches n={6} />
      <div style={dash}></div>
      <div style={{ textAlign: "center", fontSize: 9, color: "var(--ink2)" }}>★ come back tomorrow ★</div>
    </div>
  );
  return (
    <SWrap device={device}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15, padding: 18 }}>
        {card}
        <div style={{ display: "flex", gap: 9 }}><SBtn>Copy</SBtn><SBtn primary>Share ↗</SBtn></div>
        <Countdown />
      </div>
    </SWrap>
  );
}

function SWrap({ device, children }) {
  return device === "desk" ? <SDesk url="color-gradle.app/result">{children}</SDesk> : <SPhone>{children}</SPhone>;
}

function ShareScreen({ device }) {
  return (
    <>
      <SCol id="S1 · Square card" sub="Wordle-style shareable square: rank, likes, and a generative 'color signature'. Copy or share.">
        <ShareSquare device={device} />
      </SCol>
      <SCol id="S2 · Story card" sub="Tall 9:16 for Instagram/TikTok stories. Photo-forward, stats overlaid, spoiler-safe.">
        <ShareStory device={device} />
      </SCol>
      <SCol id="S3 · Receipt stub" sub="Playful 'receipt' — monospace, dashed rules, your stats printed. Distinctive & lightweight.">
        <ShareReceipt device={device} />
      </SCol>
    </>
  );
}
window.ShareScreen = ShareScreen;
