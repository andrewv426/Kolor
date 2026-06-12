/* ===================== color-gradle · hi-fi UI kit ===================== */
const { toFilter, colorSignature, ZERO, SLIDERS } = window;

/* photo = image/scene + filter + two blend overlays for temp & tint */
function Photo({ tone, src, radius, style, className = "", children, scrim }) {
  const f = toFilter(tone || ZERO);
  return (
    <div className={"photo " + className} style={{ borderRadius: radius, ...style }}>
      <div className={"img" + (src ? "" : " scene")} style={{ filter: f.filter, backgroundImage: src ? `url(${src})` : undefined }}></div>
      <div className="ov" style={{ background: f.temp }}></div>
      <div className="ov" style={{ background: f.tint, mixBlendMode: "soft-light" }}></div>
      <div className="grain"></div>
      {scrim ? <div className={"scrim" + (scrim === "soft" ? " soft" : "")}></div> : null}
      {children}
    </div>
  );
}

function Slider({ s, value, onChange, read }) {
  const pct = (value + 100) / 2;
  const fillLeft = Math.min(50, pct), fillW = Math.abs(pct - 50);
  return (
    <div className={"slider" + (read ? " read" : "")}>
      <div className="lab">
        <span className="nm">{s.label}</span>
        <span className={"vl" + (value !== 0 ? " act" : "")}>{value > 0 ? "+" + value : value}</span>
      </div>
      <div className="track">
        <span className="rail"></span><span className="tick"></span>
        <span className="fill" style={{ left: fillLeft + "%", width: fillW + "%" }}></span>
        {read ? null : <input type="range" min={-100} max={100} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} />}
        <span className="knob" style={{ left: pct + "%" }}></span>
      </div>
    </div>
  );
}

function Signature({ tone, n = 6, style }) {
  const c = colorSignature(tone || ZERO, n);
  return <div className="swrow" style={style}>{c.map((x, i) => <span key={i} className="sw" style={{ background: x }}></span>)}</div>;
}

function Upload({ onFile, label = "Use your own photo" }) {
  return (
    <label className="upload">⤓ {label}
      <input type="file" accept="image/*" onChange={(e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => onFile(r.result);
        r.readAsDataURL(f);
      }} />
    </label>
  );
}

function Heart({ n, light }) {
  return <span className="heart" style={light ? null : { color: "var(--ink-2)" }}>♡ {n}</span>;
}
function Av() { return <span className="av"></span>; }

Object.assign(window, { Photo, Slider, Signature, Upload, Heart, Av });
