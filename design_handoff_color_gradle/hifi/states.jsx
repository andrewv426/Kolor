/* ===================== color-gradle · states (modals, identity, errors) ===================== */
const { Photo: StPhoto } = window;

/* ---------------- How to play (first-run) ---------------- */
function HowTo({ onClose }) {
  const steps = [
    ["1", "One photo a day", "Everyone edits the exact same unedited shot. A fresh one drops every day."],
    ["2", "5 minutes, 10 sliders", "Temperature, exposure, contrast… make the photo yours before the clock runs out."],
    ["3", "Submit to unlock", "See how everyone, including the AI players, edited it. Like your favorites; the most-liked edits top the board."],
  ];
  return (
    <div className="ov-back" onClick={onClose}>
      <div className="ov-card" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <span className="h-md" style={{ whiteSpace: "nowrap" }}>How to play</span>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="col" style={{ gap: 16 }}>
          {steps.map(([n, t, d]) => (
            <div className="row" key={n} style={{ gap: 13, alignItems: "flex-start" }}>
              <span style={{ flex: "0 0 auto", width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 14 }}>{n}</span>
              <div className="col" style={{ gap: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 15.5 }}>{t}</span>
                <span className="dim" style={{ fontSize: 13.5, lineHeight: 1.5 }}>{d}</span>
              </div>
            </div>
          ))}
        </div>
        <button className="btn primary block lg" style={{ marginTop: 20 }} onClick={onClose}>Let's play</button>
      </div>
    </div>
  );
}

/* ---------------- Login (optional; anonymous by default) ---------------- */
function Login({ onClose, onLogin }) {
  const [name, setName] = React.useState("");
  return (
    <div className="ov-back" onClick={onClose}>
      <div className="ov-card" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <span className="h-md">Save your streak</span>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="dim" style={{ fontSize: 13.5, lineHeight: 1.5, margin: "0 0 16px" }}>
          You're playing anonymously, and that works fine. Log in to keep your streak, claim a handle, and find your edits later.
        </p>
        <div className="col" style={{ gap: 10 }}>
          <input className="input" placeholder="you@email.com" />
          <input className="input" placeholder="Pick a handle (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary block lg" onClick={() => onLogin(name.trim() || "QuietMaple52")}>Continue</button>
          <button className="btn ghost block" onClick={onClose}>Keep playing anonymously</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Photo failed to load (editor) ---------------- */
function PhotoError({ onRetry, light }) {
  return (
    <div className="col center" style={{ position: "absolute", inset: 0, gap: 14, textAlign: "center", padding: 24, background: "var(--bg-2)" }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", border: "1.5px solid var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: light ? "#fff" : "var(--ink-2)" }}>⚠</div>
      <div className="col" style={{ gap: 5 }}>
        <span style={{ fontWeight: 600, fontSize: 16, color: light ? "#fff" : "var(--ink)" }}>Couldn't load today's photo</span>
        <span className="dim" style={{ fontSize: 13.5 }}>Your edits are saved. Check your connection and retry.</span>
      </div>
      <button className="btn" onClick={onRetry}>Retry</button>
    </div>
  );
}

/* ---------------- account chip (anonymous / logged-in) ---------------- */
function Account({ user, onClick, onLight }) {
  return (
    <button className="pill" onClick={onClick}
      style={{ cursor: "pointer", color: onLight ? "#f2eee5" : "var(--ink-2)", borderColor: onLight ? "rgba(255,255,255,.25)" : "var(--line)", background: onLight ? "rgba(8,7,6,.32)" : undefined }}>
      <span style={{ width: 16, height: 16, borderRadius: "50%", background: user ? "var(--accent)" : "var(--line-2)", display: "inline-block" }}></span>
      {user ? user : "Anonymous"}
    </button>
  );
}

Object.assign(window, { HowTo, Login, PhotoError, Account });
