/* ===================== color-gradle wireframe kit ===================== */
/* Shared primitives. Consumed by screen files + app via window.* */

function Phone({ children, w = 300 }) {
  return (
    <div className="phone" style={{ width: w }}>
      <div className="notch"></div>
      <div className="phone-screen noscroll">{children}</div>
    </div>
  );
}

function Desk({ children, url = "color-gradle.app/today" }) {
  return (
    <div className="desk-win">
      <div className="desk-bar">
        <span className="tl"></span><span className="tl"></span><span className="tl"></span>
        <span className="url">{url}</span>
      </div>
      <div className="desk-screen noscroll">{children}</div>
    </div>
  );
}

/* one labelled column: annotation caption + a frame */
function Col({ id, sub, children, wide }) {
  return (
    <div className={"col" + (wide ? " deskcol" : "")}>
      <div className="annot">
        <div className="id">{id}</div>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}

/* hatched image placeholder */
function Photo({ label = "DAILY PHOTO", h, style, children }) {
  return (
    <div className="ph" style={{ height: h, ...style }}>
      {children ? children : <span className="ph-l">{label}</span>}
    </div>
  );
}

/* wireframe slider. v in -100..100 (or pct 0..100 if mode='pct') */
function Slider({ label, v = 0, mode = "bi", mini }) {
  const pct = mode === "pct" ? v : (v + 100) / 2;
  const fillLeft = mode === "pct" ? 0 : Math.min(50, pct);
  const fillW = mode === "pct" ? pct : Math.abs(pct - 50);
  const val = mode === "pct" ? v : (v > 0 ? "+" + v : "" + v);
  return (
    <div className={"slider" + (mini ? " mini" : "")}>
      <div className="s-top">
        <span className="s-label">{label}</span>
        <span className="s-val">{val}</span>
      </div>
      <div className="s-track">
        <span className="s-fill" style={{ left: fillLeft + "%", width: fillW + "%" }}></span>
        <span className="s-knob" style={{ left: pct + "%" }}></span>
      </div>
    </div>
  );
}

function Chip({ children, on }) {
  return <span className={"chip" + (on ? " on" : "")}>{children}</span>;
}
function Btn({ children, primary, accent, block, lg, ghost }) {
  const c = ["btn", primary && "primary", accent && "accent", block && "block", lg && "lg", ghost && "ghost"]
    .filter(Boolean).join(" ");
  return <span className={c}>{children}</span>;
}
function Badge({ children, fill, ai }) {
  return <span className={"badge" + (fill ? " fill" : "") + (ai ? " ai" : "")}>{children}</span>;
}
function Pill({ children }) { return <span className="pill">{children}</span>; }
function Timer({ children = "4:38" }) { return <span className="timer">{children}</span>; }
function Bars({ widths = [100, 70], d }) {
  return (
    <div className="bars">
      {widths.map((w, i) => <span key={i} className={"bar" + (d ? " d" : "")} style={{ width: w + "%" }}></span>)}
    </div>
  );
}
function Live({ children = "1,204 playing" }) {
  return <span className="pill"><span className="dotlive"></span>{children}</span>;
}
function Av() { return <span className="av"></span>; }
function Heart({ n = 23 }) { return <span className="heart">♡ {n}</span>; }
function Swatches({ n = 5 }) {
  const cols = ["var(--hatch2)", "var(--accent-soft)", "var(--line)", "var(--accent)", "var(--hatch)"];
  return (
    <div className="swatches">
      {Array.from({ length: n }).map((_, i) =>
        <span key={i} className="swatch" style={{ background: cols[i % cols.length] }}></span>)}
    </div>
  );
}
function Note({ children }) { return <span className="note">✎ {children}</span>; }

/* a small gallery tile (re-rendered edit) */
function Tile({ h = 86, label = "EDIT", you, ai, n = 12, name }) {
  return (
    <div className="tile">
      <Photo label={label} h={h} style={{ borderRadius: 0 }} />
      {you ? <span className="tag-you"><Badge fill>YOU</Badge></span> : null}
      <div className="meta">
        <span className="row" style={{ gap: 5 }}>
          <Av />{ai ? <Badge ai>AI</Badge> : null}
          {name ? <span className="mono" style={{ fontSize: 9.5, color: "var(--ink2)" }}>{name}</span> : null}
        </span>
        <Heart n={n} />
      </div>
    </div>
  );
}

Object.assign(window, {
  Phone, Desk, Col, Photo, Slider, Chip, Btn, Badge, Pill, Timer,
  Bars, Live, Av, Heart, Swatches, Note, Tile,
});
