import { useState, useEffect } from "react";

const T = {
  bg: "#18191A", surface: "#242526", elevated: "#3A3B3C",
  text: "#E4E6EB", textSecondary: "#B0B3B8", textMuted: "#8A8D91",
  blue: "#0866FF", blueHover: "#1877F2", blueLight: "rgba(8,102,255,0.12)",
  green: "#31A24C", greenBg: "rgba(49,162,76,0.15)",
  red: "#F0284A", redBg: "rgba(240,40,74,0.15)",
  orange: "#E8912D", orangeBg: "rgba(232,145,45,0.15)",
  yellow: "#F7D154", yellowBg: "rgba(247,209,84,0.15)",
  cyan: "#00C9DB", border: "#3E4042",
  font: "'Segoe UI', Helvetica, Arial, sans-serif",
};

const Badge = ({ children, color = "blue" }) => {
  const c = { blue: { bg: T.blueLight, text: T.blue }, green: { bg: T.greenBg, text: T.green }, red: { bg: T.redBg, text: T.red }, orange: { bg: T.orangeBg, text: T.orange }, muted: { bg: T.elevated, text: T.textSecondary }, yellow: { bg: T.yellowBg, text: T.yellow } }[color] || { bg: T.blueLight, text: T.blue };
  return <span style={{ display: "inline-flex", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: c.bg, color: c.text }}>{children}</span>;
};
const Mb = ({ s }) => <span style={{ display: "inline-flex", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: s === "Mobile First" ? T.blueLight : T.elevated, color: s === "Mobile First" ? T.blue : T.textMuted }}>{s === "Mobile First" ? "📱" : "🖥️"} {s}</span>;
const TR = ({ children, h }) => <tr style={{ borderBottom: `1px solid ${T.border}`, background: h ? T.elevated : "transparent" }}>{children}</tr>;
const TD = ({ children, a = "left", h }) => h ? <th style={{ padding: "8px 10px", textAlign: a, fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{children}</th> : <td style={{ padding: "9px 10px", textAlign: a, fontSize: 12, color: T.text, whiteSpace: "nowrap" }}>{children}</td>;
const Card = ({ children, style: s }) => <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 18, ...s }}>{children}</div>;
const ST = ({ children }) => <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 12 }}>{children}</div>;
const PT = ({ children, right }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 14px" }}><h2 style={{ fontSize: 19, fontWeight: 700, color: T.text, margin: 0 }}>{children}</h2>{right}</div>;
const Btn = ({ children, primary, small, danger }) => <button style={{ padding: small ? "4px 12px" : "7px 18px", borderRadius: 20, background: danger ? T.red : primary ? T.blue : "transparent", color: danger ? "#fff" : primary ? "#fff" : T.textSecondary, border: primary || danger ? "none" : `1px solid ${T.border}`, fontSize: small ? 10 : 11, fontWeight: 600, cursor: "pointer" }}>{children}</button>;
const Sel = ({ children }) => <select style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 10px", color: T.text, fontSize: 11 }}>{children}</select>;
const Bar = ({ label, value, max, color = T.blue, w = 130 }) => <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}><div style={{ width: w, fontSize: 10, color: T.textMuted, textAlign: "right", flexShrink: 0 }}>{label}</div><div style={{ flex: 1, height: 11, background: T.elevated, borderRadius: 2 }}><div style={{ width: `${max ? (value / max) * 100 : 0}%`, height: "100%", background: color, borderRadius: 2 }} /></div><div style={{ width: 18, fontSize: 10, color: T.text, fontWeight: 600, textAlign: "right" }}>{value}</div></div>;
const Stat = ({ label, value }) => <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: T.textMuted, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{value}</div></div>;
const Input = ({ label, placeholder, type = "text", value }) => <div style={{ marginBottom: 12 }}><label style={{ fontSize: 10, fontWeight: 500, color: T.textSecondary, display: "block", marginBottom: 4 }}>{label}</label><input type={type} placeholder={placeholder} defaultValue={value} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, boxSizing: "border-box" }} /></div>;

// Chip component for accompanying rangers
const RangerChip = ({ name, registered, onRemove }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 16, background: registered ? T.blueLight : T.elevated, border: `1px solid ${registered ? T.blue + "40" : T.border}`, fontSize: 11, color: registered ? T.blue : T.text, marginRight: 6, marginBottom: 4 }}>
    {registered ? "👤" : "✏️"} {name}
    {onRemove && <span onClick={onRemove} style={{ cursor: "pointer", marginLeft: 4, color: T.textMuted, fontSize: 13 }}>×</span>}
  </div>
);

// ──── WAR ROOM ────
const WarRoom = () => {
  const [ck, setCk] = useState(new Date());
  const [pulse, setPulse] = useState(true);
  useEffect(() => { const t = setInterval(() => setCk(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setPulse(p => !p), 800); return () => clearInterval(t); }, []);
  const pColor = c => c === "critical" ? T.red : c === "high" ? T.orange : c === "medium" ? T.yellow : T.green;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      <div style={{ display: "flex", gap: 8, paddingBottom: 8, flexWrap: "wrap" }}>
        {[{ l: "ACTIVE EVENTS", v: "22", c: T.orange, i: "⚡" }, { l: "UNACKNOWLEDGED", v: "3", c: T.red, i: "🔴" }, { l: "ACTIVE PATROLS", v: "6", c: T.blue, i: "🚤" }, { l: "RANGERS ON DUTY", v: "14", c: T.green, i: "👥" }, { l: "EVENTS THIS MONTH", v: "47", c: T.cyan, i: "📊" }].map((k, i) => (
          <div key={i} style={{ flex: 1, background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
            <span style={{ fontSize: 18 }}>{k.i}</span>
            <div><div style={{ fontSize: 8, fontWeight: 700, color: T.textMuted, letterSpacing: 1 }}>{k.l}</div><div style={{ fontSize: 20, fontWeight: 800, color: k.c }}>{k.v}</div></div>
          </div>
        ))}
        <div style={{ background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`, padding: "8px 12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 110 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{ck.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          <div style={{ fontSize: 8, color: T.textMuted }}>{ck.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: T.green }} /><span style={{ fontSize: 7, color: T.green, fontWeight: 600 }}>SYNCED 5s AGO</span></div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 3, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ flex: 1, background: T.elevated, borderRadius: 10, position: "relative", overflow: "hidden", border: `1px solid ${T.border}`, minHeight: 250 }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #0d1b2a 0%, #1b2838 40%, #0d2137 70%, #162230 100%)" }} />
            <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(24,25,26,0.85)", borderRadius: 5, padding: "3px 7px", zIndex: 3, fontSize: 8, color: T.textSecondary }}>🗺️ MapLibre GL · Banggai · Zoom 11</div>
            {[{ top: "25%", left: "35%", c: T.blue, l: "🚤 Pottoli Tobin 2", g: 1 }, { top: "40%", left: "50%", c: T.blue, l: "🚤 Saldi" }, { top: "30%", left: "60%", c: T.blue, l: "🚶 Adrianto" }, { top: "35%", left: "72%", c: T.green, l: "🐢 Turtle #12" }, { top: "38%", left: "45%", c: T.red, l: "💥 #14063", g: 1 }, { top: "52%", left: "55%", c: T.red, l: "💥 #14047" }].map((m, i) => (
              <div key={i} style={{ position: "absolute", top: m.top, left: m.left, zIndex: 2, display: "flex", alignItems: "center", gap: 2 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.c, border: "2px solid rgba(255,255,255,0.8)", boxShadow: m.g ? `0 0 10px ${m.c}` : `0 0 4px ${m.c}` }} />
                <span style={{ fontSize: 7, color: "#fff", background: "rgba(0,0,0,0.7)", padding: "1px 3px", borderRadius: 2, whiteSpace: "nowrap" }}>{m.l}</span>
              </div>
            ))}
            <svg style={{ position: "absolute", inset: 0, zIndex: 1 }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points="25,52 35,40 50,38 60,30" fill="none" stroke={T.blue} strokeWidth="0.3" opacity="0.5" strokeDasharray="1,0.5" />
              <polygon points="30,28 55,22 70,30 72,55 55,62 35,58 28,45" fill={T.blue} fillOpacity="0.06" stroke={T.blue} strokeWidth="0.2" strokeOpacity="0.3" strokeDasharray="2,1" />
            </svg>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`, padding: "8px 12px" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>LAW ENFORCEMENT — DEC 2025</div>
              {[{ t: "Destructive", v: 8 }, { t: "Compressor", v: 3 }].map((e, i) => <Bar key={i} label={e.t} value={e.v} max={8} w={65} />)}
            </div>
            <div style={{ flex: 1, background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`, padding: "8px 12px" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>MONITORING — DEC 2025</div>
              {[{ t: "Wildlife", v: 6, c: T.green }, { t: "Outreach", v: 4, c: T.orange }].map((e, i) => <Bar key={i} label={e.t} value={e.v} max={6} color={e.c} w={65} />)}
            </div>
            <div style={{ background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`, padding: "8px 12px", minWidth: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 7, fontWeight: 700, color: T.textMuted }}>LAST INCIDENT</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.orange }}>2m</div>
              <div style={{ fontSize: 7, color: T.textMuted }}>#14063 · Blast</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 8, minWidth: 280 }}>
          <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.red}40`, overflow: "hidden" }}>
            <div style={{ padding: "7px 12px", background: T.redBg, display: "flex", alignItems: "center", gap: 5, borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 11 }}>🚨</span><span style={{ fontSize: 10, fontWeight: 700, color: T.red }}>ALERTS & ESCALATIONS</span>
              <span style={{ marginLeft: "auto", background: T.red, color: "#fff", fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 8 }}>2</span>
            </div>
            <div style={{ padding: 5, maxHeight: 120, overflowY: "auto" }}>
              {[{ id: 14063, t: "BLAST FISHING", a: "A12a — Solan Bajo", r: "Pottoli Tobin 2", ago: "2m", ack: false }, { id: 14047, t: "BLAST FISHING", a: "A12a — Tulus Reef", r: "Pottoli Tobin 4", ago: "18m", ack: false }, { id: 13878, t: "POISON", a: "A12a — Sombuan", r: "Pottoli Tobin 4", ago: "3h", ack: true }].map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "start", gap: 6, padding: "5px 6px", borderRadius: 5, background: !e.ack ? "rgba(240,40,74,0.08)" : "transparent", marginBottom: 2 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.red, marginTop: 4, boxShadow: !e.ack && pulse ? `0 0 6px ${T.red}` : "none" }} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 10, fontWeight: 700, color: !e.ack ? T.red : T.text }}>#{e.id} — {e.t}</div><div style={{ fontSize: 8, color: T.textMuted }}>{e.a} · {e.r} · {e.ago}</div></div>
                  {!e.ack ? <button style={{ padding: "2px 7px", borderRadius: 8, background: T.red, color: "#fff", border: "none", fontSize: 7, fontWeight: 600, cursor: "pointer" }}>ACK</button> : <Badge color="muted">Ack'd</Badge>}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, boxShadow: `0 0 4px ${T.green}` }} /><span style={{ fontSize: 10, fontWeight: 700, color: T.text }}>LIVE EVENT FEED</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 5 }}>
              {[{ id: 14063, t: "Destructive — Explosives", a: "A12a", r: "Pottoli Tobin 2", tm: "2m", p: "critical", s: "new" }, { id: 14047, t: "Destructive — Explosives", a: "A12a", r: "Pottoli Tobin 4", tm: "18m", p: "critical", s: "new" }, { id: 14046, t: "Compressor Fishing", a: "A12a", r: "Pottoli Tobin 4", tm: "32m", p: "high", s: "new" }, { id: 13981, t: "Outreach", a: "A7", r: "PKM Tobuiku", tm: "1h", p: "low", s: "active" }, { id: 13967, t: "Wildlife Sighting", a: "A6", r: "PKM Togong", tm: "3h", p: "low", s: "active" }].map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", borderRadius: 3, marginBottom: 1, background: i < 2 ? "rgba(240,40,74,0.05)" : "transparent" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: pColor(e.p) }} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 9, color: T.text, fontWeight: e.p === "critical" ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>#{e.id} {e.t}</div><div style={{ fontSize: 7, color: T.textMuted }}>{e.r} · {e.a} · {e.tm}</div></div>
                  <Badge color={e.s === "new" ? "blue" : "orange"}>{e.s}</Badge>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 10 }}>🛡️</span><span style={{ fontSize: 10, fontWeight: 700, color: T.text }}>ACTIVE PATROLS</span><span style={{ fontSize: 9, color: T.blue, marginLeft: "auto", fontWeight: 600 }}>6</span>
            </div>
            <div style={{ maxHeight: 130, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><TR h><TD h>Ranger</TD><TD h>Type</TD><TD h>Area</TD><TD h a="right">Time</TD><TD h a="right">KM</TD></TR></thead><tbody>
                {[{ r: "Adrianto", t: "🚶", a: "A6", e: "4h23m", k: "18.4" }, { r: "PKM Togong", t: "🚶", a: "A7", e: "3h05m", k: "12.1" }, { r: "Pottoli Tobin 2", t: "🚤", a: "A12a", e: "6h12m", k: "87.3" }, { r: "Saldi", t: "🚤", a: "A7", e: "1h33m", k: "23.5" }].map((p, i) => <TR key={i}><TD><span style={{ color: T.blue, fontWeight: 500, fontSize: 10 }}>{p.r}</span></TD><TD>{p.t}</TD><TD>{p.a}</TD><TD a="right">{p.e}</TD><TD a="right">{p.k}</TD></TR>)}
              </tbody></table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ──── EVENT DETAIL (with Accompanying Rangers) ────
const EventDetail = () => {
  const [showDropdown, setShowDropdown] = useState(false);
  const companions = [
    { name: "Putra Larekeng", registered: true },
    { name: "Imran Idris Bado'o", registered: true },
    { name: "Abdul (Desa Matamaling)", registered: false },
  ];
  const suggestions = ["Adhi Zulfikri", "Adrianto", "Gondewa Wisnu", "Haikal Laepo", "Hayun", "Saldi", "Sri"];
  return (
    <div><Mb s="Mobile First" /><div style={{ fontSize: 10, color: T.textMuted, margin: "10px 0 5px" }}>Events / #14063</div>
      <div style={{ display: "grid", gridTemplateColumns: "5fr 3fr", gap: 14 }}>
        <div>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div><div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>Destructive Practices — Explosives</div><div style={{ fontSize: 11, color: T.textMuted }}>#14063 · Pottoli Tobin 2</div></div>
              <Badge color="red">Critical</Badge>
            </div>
            <div style={{ background: T.bg, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 5, textTransform: "uppercase" }}>Field Notes</div>
              <p style={{ fontSize: 11, color: T.text, lineHeight: 1.6, margin: 0 }}>Tim Blue Alliance Indonesia (BAI) mendengar suara ledakan saat melakukan patroli di sekitar Solan Bajo Reef. Pelaku dicurigai adalah Ittang atau Abdul.</p>
            </div>
            {[
              ["Area (raw)", <span><span style={{ color: T.text }}>A12a</span> <span style={{ fontSize: 9, color: T.textMuted, marginLeft: 6 }}>from ER, preserved verbatim</span></span>],
              ["Area Boundary (derived FK)", <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Badge color="blue">Solan Bajo Reef</Badge><span style={{ fontSize: 9, color: T.textMuted }}>matched via name+alias · derived 32s ago</span></span>],
              ["Event Type", "Use of Explosives"],
              ["Vessel Name", "NN"],
              ["Vessel Registration", "NN"],
              ["Address", "Lelang Matamaling"],
              ["Offender(s)", "Ittang atau Abdul"],
              ["Action Taken", <span style={{ color: T.textMuted, fontStyle: "italic" }}>— (pending; CC-owned field, push-back to ER on save)</span>],
              ["Photo", <span style={{ color: T.textMuted }}>NO IMAGE <span style={{ fontSize: 9, marginLeft: 4 }}>has_photo: false</span></span>],
            ].map(([k, v], i) => (
              <div key={i} style={{ display: "flex", padding: "7px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ width: 160, fontSize: 10, color: T.textMuted }}>{k}</div><div style={{ fontSize: 11, color: T.text, flex: 1 }}>{v}</div></div>
            ))}
          </Card>

          {/* ★ ACCOMPANYING RANGERS — NEW FEATURE */}
          <Card style={{ marginTop: 12, borderLeft: `3px solid ${T.blue}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <ST>👥 Accompanying Rangers</ST>
              <Badge color="blue">{companions.length} tagged</Badge>
            </div>
            <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 10, lineHeight: 1.5 }}>
              Rangers who participated in this event receive equal performance credit as the reporter.
            </div>
            <div style={{ marginBottom: 10 }}>
              {companions.map((c, i) => (
                <RangerChip key={i} name={c.name} registered={c.registered} onRemove={() => {}} />
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    placeholder="Search registered rangers or type a name..."
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 11, boxSizing: "border-box" }}
                  />
                  {showDropdown && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 160, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                      <div style={{ padding: "6px 10px", fontSize: 9, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", borderBottom: `1px solid ${T.border}` }}>Registered Users</div>
                      {suggestions.map((s, i) => (
                        <div key={i} style={{ padding: "7px 10px", fontSize: 11, color: T.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 600, color: "#fff" }}>{s.charAt(0)}</div>
                          {s}
                          <Badge color="blue">Registered</Badge>
                        </div>
                      ))}
                      <div style={{ padding: "6px 10px", fontSize: 9, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", borderBottom: `1px solid ${T.border}`, borderTop: `1px solid ${T.border}` }}>Or add unregistered person</div>
                      <div style={{ padding: "7px 10px", fontSize: 11, color: T.orange, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        ✏️ Type any name and press Enter to add as free-text
                      </div>
                    </div>
                  )}
                </div>
                <Btn primary small>+ Add</Btn>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: "8px 10px", background: T.elevated, borderRadius: 6, fontSize: 9, color: T.textMuted, display: "flex", gap: 12 }}>
              <span>👤 = Registered user (auto-linked to profile)</span>
              <span>✏️ = Free-text name (saved to known rangers for future use)</span>
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card><ST>Status</ST><div style={{ display: "flex", gap: 5 }}>{["New", "Active", "Resolved"].map((s, i) => <button key={i} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${i === 0 ? T.blue : T.border}`, background: i === 0 ? T.blue : "transparent", color: i === 0 ? "#fff" : T.textSecondary, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>{s}</button>)}</div></Card>
          <Card><ST>Location</ST><div style={{ background: T.elevated, borderRadius: 8, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 10, color: T.textMuted }}>📍 -1.2834, 123.5012</span></div></Card>
          <Card><ST>Performance Credit</ST>
            <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.5 }}>
              This event awards <strong style={{ color: T.text }}>1 credit</strong> each to:
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 11, color: T.blue }}>Pottoli Tobin 2</span>
                <Badge color="blue">Reporter</Badge>
              </div>
              {companions.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 11, color: c.registered ? T.blue : T.text }}>{c.name}</span>
                  <Badge color="muted">Companion</Badge>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: T.green, fontWeight: 600 }}>= 4 rangers credited for this event</div>
          </Card>
          <Card><ST>Timeline</ST>{[{ a: "Created", b: "Pottoli Tobin 2", t: "Dec 31, 04:03" }, { a: "Synced", b: "System", t: "Dec 31, 04:04" }, { a: "Companions added", b: "Operator Siti", t: "Dec 31, 04:15" }].map((t, i) => <div key={i} style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: T.blue, marginTop: 5 }} /><div><div style={{ fontSize: 10, color: T.text }}>{t.a}</div><div style={{ fontSize: 9, color: T.textMuted }}>{t.b} · {t.t}</div></div></div>)}</Card>
        </div>
      </div>
    </div>
  );
};

// ──── PATROL MONITOR (with Accompanying Rangers) ────
const PatrolMonitor = () => (
  <div><Mb s="Mobile Ready" /><PT>Patrol Monitor</PT>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
      <Card><ST>Active Patrols (6)</ST>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><TR h><TD h>Ranger</TD><TD h>Type</TD><TD h>Boat</TD><TD h>Area</TD><TD h a="right">Time</TD><TD h a="right">KM</TD></TR></thead><tbody>
          {[{ r: "Adrianto", t: "🚶 Foot", b: "—", a: "A6", e: "4h23m", k: "18.4" }, { r: "PKM Togong", t: "🚶 Foot", b: "—", a: "A7", e: "3h05m", k: "12.1" }, { r: "Pottoli Tobin 2", t: "🚤 Sea", b: "Ang Pangarap", a: "A12a", e: "6h12m", k: "87.3" }, { r: "Saldi", t: "🚤 Sea", b: "San Pedro II", a: "A7", e: "1h33m", k: "23.5" }].map((p, i) => (
            <TR key={i}><TD><span style={{ color: T.blue, fontSize: 10 }}>{p.r}</span></TD><TD>{p.t}</TD><TD><span style={{ fontSize: 10, color: p.b === "—" ? T.textMuted : T.text }}>{p.b}</span></TD><TD>{p.a}</TD><TD a="right">{p.e}</TD><TD a="right">{p.k}</TD></TR>
          ))}
        </tbody></table>
      </Card>
      <Card><ST>Patrol Map</ST>
        <div style={{ background: T.elevated, borderRadius: 8, height: 180, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #0d1b2a, #162230)" }} />
          <span style={{ fontSize: 10, color: T.textMuted, zIndex: 1 }}>🗺️ Active patrol tracks on map</span>
        </div>
      </Card>
    </div>

    {/* ★ Patrol Detail with Accompanying Rangers */}
    <Card style={{ borderLeft: `3px solid ${T.cyan}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Patrol #501 — Seabourn Patrol</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>Leader: Pottoli Tobin 2 · Area 12a · Dec 31, 2025</div>
        </div>
        <Badge color="green">Completed</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <Stat label="Duration" value="6h 12m" /><Stat label="Distance" value="87.3 km" /><Stat label="Events" value="2" />
      </div>

      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <ST>👥 Accompanying Rangers on this Patrol</ST>
          <Badge color="blue">3 tagged</Badge>
        </div>
        <div style={{ marginBottom: 8 }}>
          <RangerChip name="Putra Larekeng" registered={true} onRemove={() => {}} />
          <RangerChip name="Imran Idris Bado'o" registered={true} onRemove={() => {}} />
          <RangerChip name="Nelson" registered={true} onRemove={() => {}} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input placeholder="Add ranger..." style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 11, boxSizing: "border-box" }} />
          <Btn primary small>+ Add</Btn>
        </div>
        <div style={{ marginTop: 8, padding: "6px 10px", background: T.greenBg, borderRadius: 6, fontSize: 9, color: T.green, fontWeight: 500 }}>
          ✓ 4 rangers credited: Leader (Pottoli Tobin 2) + 3 companions — equal credit (87.3 km, 6h 12m each)
        </div>
      </div>
    </Card>
  </div>
);

// ──── RANGER PERFORMANCE (with Algorithm) ────
const ReportRangers = () => {
  const rangers = [
    { n: "Putra Larekeng", rep: 7, acc: 2, total: 9, comp: 2, destr: 5, wildlife: 2, out: 0, thr: 0, f: 11, fk: 55, s: 5, sk: 22 },
    { n: "Pottoli Tobin", rep: 5, acc: 0, total: 5, comp: 0, destr: 2, wildlife: 3, out: 0, thr: 0, f: 9, fk: 63, s: 38, sk: 2065 },
    { n: "Adrianto", rep: 0, acc: 3, total: 3, comp: 0, destr: 0, wildlife: 0, out: 0, thr: 0, f: 92, fk: 1605, s: 1, sk: 54 },
    { n: "Imran Idris Bado'o", rep: 0, acc: 4, total: 4, comp: 0, destr: 2, wildlife: 1, out: 0, thr: 1, f: 46, fk: 146, s: 4, sk: 63 },
    { n: "PKM Togong", rep: 1, acc: 0, total: 1, comp: 0, destr: 0, wildlife: 0, out: 1, thr: 0, f: 63, fk: 371, s: 15, sk: 314 },
    { n: "PKM Tobuiku", rep: 0, acc: 1, total: 1, comp: 0, destr: 0, wildlife: 0, out: 0, thr: 0, f: 35, fk: 241, s: 9, sk: 163 },
    { n: "Saldi", rep: 0, acc: 2, total: 2, comp: 0, destr: 0, wildlife: 0, out: 0, thr: 0, f: 22, fk: 208, s: 8, sk: 230 },
    { n: "Nelson", rep: 0, acc: 3, total: 3, comp: 0, destr: 1, wildlife: 1, out: 0, thr: 1, f: 16, fk: 95, s: 6, sk: 140 },
    { n: "Abdul (Matamaling)", rep: 0, acc: 2, total: 2, comp: 0, destr: 2, wildlife: 0, out: 0, thr: 0, f: 0, fk: 0, s: 0, sk: 0 },
  ];
  return (
    <div><Mb s="Mobile Ready" /><PT right={<Btn primary>Export CSV</Btn>}>Ranger Performance — Dec 2025</PT>

      {/* Algorithm explanation card */}
      <Card style={{ marginBottom: 14, borderLeft: `3px solid ${T.cyan}`, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>🧮</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Performance Algorithm</span>
        </div>
        <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.6 }}>
          Credit = <strong style={{ color: T.text }}>Events Reported</strong> + <strong style={{ color: T.text }}>Events Accompanied</strong> + <strong style={{ color: T.text }}>Patrols Led</strong> + <strong style={{ color: T.text }}>Patrols Accompanied</strong>. All activity types earn equal credit. Reporter and all tagged companions receive the same 1 point per event/patrol. Event type columns are <strong style={{ color: T.cyan }}>dynamically synced</strong> from EarthRanger — new types appear automatically.
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "auto", marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><TR h>
            <TD h>Ranger</TD>
            <TD h a="center" style={{ color: T.green }}>Reported</TD>
            <TD h a="center" style={{ color: T.orange }}>Accompanied</TD>
            <TD h a="center" style={{ color: T.cyan }}>Total Credit</TD>
            <TD h a="center">Comp</TD><TD h a="center">Destr</TD><TD h a="center">Wildlife</TD><TD h a="center">Outreach</TD><TD h a="center">Threats</TD>
            <TD h a="center">Foot#</TD><TD h a="center">Foot KM</TD><TD h a="center">Sea#</TD><TD h a="center">Sea KM</TD>
          </TR></thead>
          <tbody>
            {rangers.map((r, i) => (
              <TR key={i}>
                <TD>
                  <span style={{ color: r.n.includes("(") ? T.text : T.blue, fontWeight: 500 }}>{r.n}</span>
                  {r.n.includes("(") && <div style={{ fontSize: 8, color: T.textMuted }}>✏️ Free-text</div>}
                </TD>
                <TD a="center"><span style={{ color: T.green, fontWeight: 600 }}>{r.rep}</span></TD>
                <TD a="center"><span style={{ color: T.orange, fontWeight: 600 }}>{r.acc}</span></TD>
                <TD a="center"><span style={{ fontSize: 13, fontWeight: 800, color: T.cyan }}>{r.total}</span></TD>
                <TD a="center">{r.comp || "—"}</TD><TD a="center">{r.destr || "—"}</TD><TD a="center">{r.wildlife || "—"}</TD><TD a="center">{r.out || "—"}</TD><TD a="center">{r.thr || "—"}</TD>
                <TD a="center">{r.f || "—"}</TD><TD a="center">{r.fk || "—"}</TD><TD a="center">{r.s || "—"}</TD><TD a="center">{r.sk || "—"}</TD>
              </TR>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ display: "flex", gap: 8, fontSize: 9, color: T.textMuted }}>
        <span>👤 = Registered user</span>
        <span>✏️ = Free-text (unregistered ranger)</span>
        <span style={{ color: T.green }}>● Reported = ranger filed the report</span>
        <span style={{ color: T.orange }}>● Accompanied = tagged as companion</span>
        <span style={{ color: T.cyan }}>● Total = sum of both</span>
      </div>
    </div>
  );
};

// ──── RANGER DETAIL (with breakdown) ────
const RangerDetail = () => (
  <div><Mb s="Mobile First" /><div style={{ fontSize: 10, color: T.textMuted, margin: "10px 0 5px" }}>Rangers / Pottoli Tobin</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
      <div>
        <Card style={{ marginBottom: 12 }}>
          <div style={{ width: 50, height: 50, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 auto 10px" }}>PT</div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Pottoli Tobin</div><div style={{ fontSize: 10, color: T.textMuted }}>Ranger · Area 12</div></div>
        </Card>
        <Card>
          <ST>Performance Breakdown</ST>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, color: T.green }}>Events Reported</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.green }}>5</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, color: T.orange }}>Events Accompanied</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.orange }}>0</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, color: T.blue }}>Patrols Led</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.blue }}>47</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, color: T.orange }}>Patrols Accompanied</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.orange }}>0</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginTop: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.cyan }}>Total Credit</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.cyan }}>52</span>
          </div>
        </Card>
      </div>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Card><ST>Foot Patrol</ST><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}><Stat label="Patrols" value="9" /><Stat label="KMs" value="62.6" /><Stat label="Hours" value="40" /></div><div style={{ fontSize: 9, color: T.textMuted, marginTop: 6 }}>Includes 0 accompanied patrols</div></Card>
          <Card><ST>Seabourn Patrol</ST><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}><Stat label="Patrols" value="38" /><Stat label="KMs" value="2,065" /><Stat label="Hours" value="293" /></div><div style={{ fontSize: 9, color: T.textMuted, marginTop: 6 }}>Includes 0 accompanied patrols</div></Card>
        </div>
        <Card><ST>Recent Activity</ST>
          {[
            { d: "Dec 31", a: "Reported Event #14063 — Blast Fishing at Solan Bajo Reef", tag: "Reporter" },
            { d: "Dec 31", a: "Completed Seabourn Patrol #501 — 87.3 km, 6h 12m", tag: "Leader" },
            { d: "Dec 28", a: "Reported Event #14046 — Compressor Fishing", tag: "Reporter" },
            { d: "Dec 15", a: "Reported Wildlife Sighting — Dolphins, Palagang Reef", tag: "Reporter" },
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 6, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.blue, marginTop: 5 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: T.text }}>{e.a}</div>
                <div style={{ fontSize: 9, color: T.textMuted }}>{e.d}</div>
              </div>
              <Badge color={e.tag === "Reporter" || e.tag === "Leader" ? "green" : "orange"}>{e.tag}</Badge>
            </div>
          ))}
        </Card>
      </div>
    </div>
  </div>
);

// ──── OTHER SCREENS (condensed) ────
const LoginScreen = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
    <div style={{ width: 340, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, padding: 32 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}><div style={{ fontSize: 24, fontWeight: 700, color: T.text }}>🌊 Marine Guardian</div><div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Marine Protected Area Operations Intelligence</div></div>
      <Input label="Email" placeholder="operator@banggai-mpa.org" type="email" />
      <Input label="Password" placeholder="••••••••" type="password" />
      <button style={{ width: "100%", padding: "10px 0", borderRadius: 20, background: T.blue, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>Sign In</button>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>{["🇬🇧 EN", "🇮🇩 ID", "🇲🇾 MY"].map((l, i) => <button key={i} style={{ padding: "3px 8px", borderRadius: 10, border: `1px solid ${i === 0 ? T.blue : T.border}`, background: i === 0 ? T.blueLight : "transparent", color: i === 0 ? T.blue : T.textMuted, fontSize: 9, cursor: "pointer" }}>{l}</button>)}</div>
    </div>
  </div>
);

const Dashboard = () => (<div><Mb s="Mobile Ready" /><PT>Dashboard — Banggai MPA</PT><div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>{[{ l: "Active Events", v: "22", d: "+8 (57%)" }, { l: "Active Patrols", v: "6", d: "+2" }, { l: "Rangers On Duty", v: "14", d: "-1" }, { l: "Events This Month", v: "47", d: "+15" }].map((k, i) => <Card key={i} style={{ flex: 1, minWidth: 140 }}><div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>{k.l}</div><div style={{ fontSize: 24, fontWeight: 700, color: T.text }}>{k.v}</div><div style={{ fontSize: 10, color: k.d.startsWith("+") ? T.green : T.red, marginTop: 4 }}>{k.d} vs last month</div></Card>)}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Card><ST>Law Enforcement</ST>{[{ t: "Destructive", v: 8 }, { t: "Compressor", v: 5 }, { t: "Unreg Illegal", v: 3 }, { t: "Prohibited Area", v: 2 }].map((e, i) => <Bar key={i} label={e.t} value={e.v} max={8} />)}</Card><Card><ST>Monitoring</ST>{[{ t: "Wildlife", v: 6, c: T.green }, { t: "Community", v: 4, c: T.orange }, { t: "Habitat", v: 2, c: T.red }].map((e, i) => <Bar key={i} label={e.t} value={e.v} max={6} color={e.c} />)}</Card></div></div>);

const LiveMap = () => (<div><Mb s="Mobile Ready" /><PT>Live Map — Banggai MPA</PT><div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>{["All Layers", "Subjects", "Events", "Tracks", "Heatmap", "Areas"].map((l, i) => <button key={i} style={{ padding: "4px 12px", borderRadius: 16, border: `1px solid ${i === 0 ? T.blue : T.border}`, background: i === 0 ? T.blueLight : "transparent", color: i === 0 ? T.blue : T.textSecondary, fontSize: 10, cursor: "pointer" }}>{l}</button>)}</div><div style={{ background: T.elevated, borderRadius: 10, height: 340, position: "relative", overflow: "hidden", border: `1px solid ${T.border}` }}><div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #0d1b2a, #1b2838, #162230)" }} /><div style={{ position: "absolute", top: 8, left: 8, background: "rgba(24,25,26,0.85)", borderRadius: 5, padding: "4px 8px", zIndex: 2, fontSize: 9, color: T.textSecondary }}>🗺️ Full-screen MapLibre GL</div></div></div>);

const EventKanban = () => { const cols = [{ title: "New", color: T.blue, events: [{ id: 14063, t: "Destructive Practices", s: "Explosives", p: "critical", r: "Pottoli Tobin 2", a: "A12a" }, { id: 14046, t: "Compressor Fishing", s: "", p: "high", r: "Pottoli Tobin 4", a: "A12a" }] }, { title: "Active", color: T.orange, events: [{ id: 13878, t: "Destructive — Poison", s: "", p: "high", r: "Pottoli Tobin 4", a: "A12a" }, { id: 13862, t: "Threats on Habitat", s: "Corals", p: "medium", r: "Saldi", a: "A7" }] }, { title: "Resolved", color: T.green, events: [{ id: 13858, t: "Wildlife — Turtles", s: "", p: "low", r: "Saldi", a: "A6" }] }]; return (<div><Mb s="Mobile Ready" /><PT right={<div style={{ display: "flex", gap: 5 }}><Sel><option>All Categories</option></Sel><Sel><option>All Areas</option></Sel></div>}>Event Management — Kanban</PT><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>{cols.map((col, ci) => <div key={ci} style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}><div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: col.color }} /><span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{col.title}</span><span style={{ fontSize: 10, color: T.textMuted, marginLeft: "auto" }}>{col.events.length}</span></div><div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>{col.events.map((e, ei) => <div key={ei} style={{ background: T.bg, borderRadius: 6, padding: 10, border: `1px solid ${T.border}`, cursor: "grab" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ fontSize: 9, color: T.textMuted }}>#{e.id}</span><Badge color={e.p === "critical" ? "red" : "orange"}>{e.p}</Badge></div><div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{e.t}</div><div style={{ fontSize: 9, color: T.textMuted, marginTop: 3 }}>{e.r} · {e.a}</div></div>)}</div></div>)}</div></div>); };

const PatrolAreas = () => (<div><Mb s="Mobile Ready" /><PT right={<Btn primary>+ New Area</Btn>}>Patrol Area Map Editor</PT><div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[{ n: "Zone Alpha — North Reef", t: "🚤 Sea", r: 3, c: T.blue }, { n: "Zone Bravo — Coastal", t: "🚶 Foot", r: 4, c: T.green }, { n: "Zone Charlie — Sombuan", t: "🚤 Sea", r: 2, c: T.orange }].map((z, i) => <Card key={i} style={{ padding: 12, borderLeft: `3px solid ${z.c}` }}><div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{z.n}</div><div style={{ fontSize: 10, color: T.textSecondary, marginTop: 3 }}>{z.t} · {z.r} rangers</div><div style={{ display: "flex", gap: 4, marginTop: 6 }}><Btn small>Edit</Btn><Btn small>Assign</Btn></div></Card>)}</div><Card style={{ padding: 0, overflow: "hidden" }}><div style={{ background: T.elevated, height: 300, position: "relative" }}><div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #0d1b2a, #1b2838)" }} /><div style={{ position: "absolute", top: 8, left: 8, background: "rgba(24,25,26,0.85)", borderRadius: 5, padding: "4px 8px", zIndex: 2, fontSize: 9, color: T.textSecondary }}>🗺️ Polygon draw tool</div><svg style={{ position: "absolute", inset: 0, zIndex: 1 }} viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="15,20 45,15 50,30 40,45 20,40" fill={T.blue} fillOpacity="0.1" stroke={T.blue} strokeWidth="0.3" /><polygon points="10,50 35,48 38,65 15,68" fill={T.green} fillOpacity="0.1" stroke={T.green} strokeWidth="0.3" /><polygon points="55,25 80,20 85,45 75,55 58,48" fill={T.orange} fillOpacity="0.1" stroke={T.orange} strokeWidth="0.3" /></svg></div></Card></div></div>);

const PatrolSchedule = () => { const rs = ["Adrianto", "PKM Togong", "Pottoli Tobin", "Imran", "Saldi", "PKM Tobuiku", "Nelson", "Putra"]; const ds = Array.from({ length: 14 }, (_, i) => i + 1); const asg = [{ r: 0, s: 1, e: 4, z: "Alpha", c: T.blue }, { r: 0, s: 8, e: 11, z: "Bravo", c: T.green }, { r: 1, s: 2, e: 6, z: "Bravo", c: T.green }, { r: 2, s: 1, e: 7, z: "Alpha", c: T.blue }, { r: 2, s: 9, e: 14, z: "Delta", c: T.cyan }, { r: 3, s: 3, e: 7, z: "Bravo", c: T.green }, { r: 4, s: 1, e: 5, z: "Charlie", c: T.orange }, { r: 5, s: 4, e: 9, z: "Delta", c: T.cyan }, { r: 6, s: 1, e: 6, z: "Alpha", c: T.blue }, { r: 7, s: 2, e: 8, z: "Charlie", c: T.orange }]; return (<div><Mb s="Mobile Ready" /><PT right={<div style={{ display: "flex", gap: 4 }}><Btn small>◀</Btn><span style={{ fontSize: 11, color: T.text, padding: "3px 8px" }}>Jan 1–14, 2026</span><Btn small>▶</Btn><Btn primary small>+ Assign</Btn></div>}>Patrol Schedule — Gantt</PT><Card style={{ padding: 0, overflow: "auto" }}><div style={{ display: "grid", gridTemplateColumns: `120px repeat(${ds.length}, 1fr)`, minWidth: 700 }}><div style={{ padding: "6px 10px", background: T.elevated, borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 600, color: T.textMuted }}>RANGER</div>{ds.map(d => <div key={d} style={{ padding: "6px 3px", background: T.elevated, borderBottom: `1px solid ${T.border}`, borderLeft: `1px solid ${T.border}`, fontSize: 9, color: T.textMuted, textAlign: "center" }}>{d}</div>)}{rs.map((r, ri) => <>{/* */}<div key={`r${ri}`} style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}`, fontSize: 10, color: T.blue, fontWeight: 500 }}>{r}</div>{ds.map(d => { const a = asg.find(a => a.r === ri && d >= a.s && d <= a.e); const iS = a && d === a.s; const iE = a && d === a.e; return <div key={`${ri}-${d}`} style={{ borderBottom: `1px solid ${T.border}`, borderLeft: `1px solid ${T.border}`, padding: 1, display: "flex", alignItems: "center" }}>{a && <div style={{ width: "100%", height: 18, background: a.c + "30", borderRadius: iS ? "3px 0 0 3px" : iE ? "0 3px 3px 0" : 0, display: "flex", alignItems: "center", justifyContent: "center", borderTop: `2px solid ${a.c}`, borderBottom: `2px solid ${a.c}`, borderLeft: iS ? `2px solid ${a.c}` : "none", borderRight: iE ? `2px solid ${a.c}` : "none" }}>{iS && <span style={{ fontSize: 7, color: a.c, fontWeight: 600 }}>{a.z}</span>}</div>}</div>; })}</>)}</div></Card></div>); };

const ReportArea = () => (<div><Mb s="Mobile Ready" /><PT right={<div style={{ display: "flex", gap: 5 }}><Sel><option>Area 12</option><option>A5</option><option>A6</option></Sel><Btn primary>Export PDF</Btn></div>}>Per Area Report</PT><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}><Card><ST>Law Enforcement — Area 12</ST><div style={{ fontSize: 9, color: T.cyan, marginBottom: 6 }}>⟳ Dynamically synced from EarthRanger event types</div>{[{ t: "Destructive", v: 7 }, { t: "Compressor", v: 3 }].map((e, i) => <Bar key={i} label={e.t} value={e.v} max={7} />)}</Card><Card><ST>Monitoring — Area 12</ST><div style={{ fontSize: 9, color: T.cyan, marginBottom: 6 }}>⟳ Dynamically synced from EarthRanger event types</div>{[{ t: "Wildlife", v: 3, c: T.green }].map((e, i) => <Bar key={i} label={e.t} value={e.v} max={3} color={e.c} />)}</Card></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Card><ST>Foot Patrol — Area 12</ST><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}><Stat label="Patrols" value="10" /><Stat label="KMs" value="87" /><Stat label="Hrs" value="45" /></div></Card><Card><ST>Seabourn Patrol — Area 12</ST><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}><Stat label="Patrols" value="41" /><Stat label="KMs" value="2,127" /><Stat label="Hrs" value="334" /></div></Card></div></div>);

const ReportConsolidated = () => (<div><Mb s="Mobile Ready" /><PT right={<Btn primary>Export PDF</Btn>}>Consolidated Report — Dec 2025</PT><Card style={{ marginBottom: 12 }}><ST>Law Enforcement & Apprehensions</ST><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><TR h><TD h>Area</TD><TD h a="center">Unreg</TD><TD h a="center">Prohibited</TD><TD h a="center">Compressor</TD><TD h a="center">Destructive</TD><TD h a="center" style={{ color: T.red }}>TOTAL</TD></TR></thead><tbody>{[["A5", 0, 0, 0, 0], ["A6", 0, 0, 0, 1], ["Area 12", 0, 0, 3, 7], ["A7", 0, 0, 0, 0]].map((r, i) => <TR key={i}><TD><strong>{r[0]}</strong></TD>{r.slice(1).map((v, j) => <TD key={j} a="center">{v || "—"}</TD>)}<TD a="center"><strong style={{ color: T.red }}>{r.slice(1).reduce((a, b) => a + b, 0)}</strong></TD></TR>)}</tbody></table></Card><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Card><ST>Foot Patrol — All Areas</ST><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><TR h><TD h>Area</TD><TD h a="center">#</TD><TD h a="right">KM</TD><TD h a="right">Hrs</TD></TR></thead><tbody>{[["A6", 216, "2,157", "702"], ["A7", 56, "454", "265"], ["Area 12", 10, "87", "45"]].map((r, i) => <TR key={i}><TD><strong>{r[0]}</strong></TD><TD a="center">{r[1]}</TD><TD a="right">{r[2]}</TD><TD a="right">{r[3]}</TD></TR>)}</tbody></table></Card><Card><ST>Seabourn — All Areas</ST><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><TR h><TD h>Area</TD><TD h a="center">#</TD><TD h a="right">KM</TD><TD h a="right">Hrs</TD></TR></thead><tbody>{[["A6", 26, "520", "159"], ["A7", 15, "260", "74"], ["Area 12", 41, "2,127", "334"]].map((r, i) => <TR key={i}><TD><strong>{r[0]}</strong></TD><TD a="center">{r[1]}</TD><TD a="right">{r[2]}</TD><TD a="right">{r[3]}</TD></TR>)}</tbody></table></Card></div></div>);

const ReportDetailed = () => (<div><Mb s="Mobile Ready" /><PT right={<Btn primary>Export CSV</Btn>}>Detailed Event Log — Dec 2025</PT><Card style={{ padding: 0, overflow: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}><thead><TR h><TD h>ID</TD><TD h>Type</TD><TD h>Reporter</TD><TD h>Date</TD><TD h>Area</TD><TD h>Offender</TD><TD h>Companions</TD><TD h>Photo</TD></TR></thead><tbody>{[{ id: 14063, t: "Destructive — Explosives", r: "Pottoli Tobin 2", d: "Dec 31", a: "A12a", o: "Ittang/Abdul", c: "Putra, Imran, Abdul", p: "No" }, { id: 13878, t: "Destructive — Poison", r: "Pottoli Tobin 4", d: "Dec 12", a: "A12a", o: "Rino", c: "—", p: "No" }, { id: 13858, t: "Wildlife — Turtles", r: "Saldi", d: "Dec 10", a: "A6", o: "—", c: "Adrianto, Sri", p: "Yes" }].map((e, i) => <TR key={i}><TD><span style={{ color: T.blue }}>#{e.id}</span></TD><TD>{e.t}</TD><TD>{e.r}</TD><TD>{e.d}</TD><TD>{e.a}</TD><TD>{e.o}</TD><TD><span style={{ color: e.c === "—" ? T.textMuted : T.orange }}>{e.c}</span></TD><TD>{e.p === "Yes" ? <Badge color="green">📷</Badge> : "—"}</TD></TR>)}</tbody></table></Card></div>);

const AlertRules = () => (<div><Mb s="Mobile Ready" /><PT right={<Btn primary>+ New Rule</Btn>}>Alert Rules</PT>{[{ n: "Blast Fishing Alert", c: "Event Type = Destructive AND Priority ≥ High", ch: ["In-App", "Email"], a: true }, { n: "Critical Event — Any", c: "Priority = Critical", ch: ["In-App", "Email"], a: true }, { n: "Wildlife Sighting", c: "Event Type = Marine Wildlife", ch: ["In-App"], a: true }, { n: "Stale GPS", c: "Subject position > 24h", ch: ["In-App"], a: false }].map((r, i) => <Card key={i} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12, padding: 14 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: r.a ? T.green : T.textMuted }} /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{r.n}</div><div style={{ fontSize: 10, color: T.textSecondary, marginTop: 2 }}>{r.c}</div><div style={{ display: "flex", gap: 4, marginTop: 4 }}>{r.ch.map((c, j) => <Badge key={j} color="muted">{c}</Badge>)}</div></div><Badge color={r.a ? "green" : "muted"}>{r.a ? "Active" : "Off"}</Badge><Btn small>Edit</Btn></Card>)}</div>);

const Notifications = () => (<div><Mb s="Mobile First" /><PT right={<Btn small>Mark All Read</Btn>}>Notifications</PT><div style={{ display: "flex", gap: 5, marginBottom: 12 }}>{["All", "Unread (3)", "Alerts", "System"].map((f, i) => <button key={i} style={{ padding: "4px 10px", borderRadius: 16, border: `1px solid ${i === 0 ? T.blue : T.border}`, background: i === 0 ? T.blueLight : "transparent", color: i === 0 ? T.blue : T.textSecondary, fontSize: 10, cursor: "pointer" }}>{f}</button>)}</div>{[{ t: "Critical: Blast fishing at Solan Bajo", b: "Event #14063 reported.", tm: "2m ago", rd: false, tp: "critical" }, { t: "Blast fishing Area 12a", b: "Event #14047.", tm: "18m ago", rd: false, tp: "critical" }, { t: "Wildlife sighting", b: "Dolphins, Palagang Reef.", tm: "3h ago", rd: false, tp: "info" }, { t: "Sync complete", b: "364 observations synced.", tm: "5m ago", rd: true, tp: "system" }].map((n, i) => <div key={i} style={{ background: n.rd ? T.surface : T.blueLight, borderRadius: 8, border: `1px solid ${T.border}`, padding: "10px 14px", marginBottom: 5, display: "flex", gap: 8, alignItems: "start" }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: n.tp === "critical" ? T.red : n.tp === "system" ? T.textMuted : T.blue, marginTop: 4 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: n.rd ? 400 : 600, color: T.text }}>{n.t}</div><div style={{ fontSize: 10, color: T.textSecondary }}>{n.b}</div><div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{n.tm}</div></div>{!n.rd && <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.blue }} />}</div>)}</div>);

const UserMgmt = () => (<div><Mb s="Mobile Ready" /><PT right={<Btn primary>+ Add User</Btn>}>User Management</PT><Card style={{ padding: 0, overflow: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><TR h><TD h>Name</TD><TD h>Email</TD><TD h>Role</TD><TD h>Last Login</TD><TD h>Status</TD><TD h>Actions</TD></TR></thead><tbody>{[{ n: "Ahmad", e: "ahmad@banggai.org", r: "Coordinator", l: "2h ago", s: true }, { n: "Siti", e: "siti@banggai.org", r: "Operator", l: "30m ago", s: true }, { n: "Budi", e: "budi@banggai.org", r: "Site Admin", l: "1d ago", s: true }].map((u, i) => <TR key={i}><TD><span style={{ fontWeight: 500 }}>{u.n}</span></TD><TD>{u.e}</TD><TD><Badge color={u.r === "Site Admin" ? "red" : u.r === "Coordinator" ? "orange" : "blue"}>{u.r}</Badge></TD><TD>{u.l}</TD><TD><Badge color="green">Active</Badge></TD><TD><Btn small>Edit</Btn></TD></TR>)}</tbody></table></Card></div>);

// ──── TENANT SETTINGS — Round 4: Path A/B + Test Connection + Verify ER Limits ★★ ────
const TenantSettings = () => {
  const [authPath, setAuthPath] = useState("A"); // A = tokens (preferred), B = user/pass
  const [testResult, setTestResult] = useState("✓ Connected — verified 2 min ago");
  const [verifyResult, setVerifyResult] = useState({ done: true, page: 100, headers: true, when: "Jan 12, 2026" });
  return (
    <div><Mb s="Mobile Ready" /><PT>Tenant Settings — Banggai MPA</PT>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card>
          <ST>EarthRanger Connection</ST>
          <Input label="Server URL" value="https://banggai.pamdas.org" />

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: T.textSecondary, marginBottom: 6 }}>Authentication Method</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setAuthPath("A")} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${authPath === "A" ? T.blue : T.border}`, background: authPath === "A" ? T.blueLight : "transparent", color: authPath === "A" ? T.blue : T.textSecondary, fontSize: 10, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>(A) Token Pair</div>
                <div style={{ fontSize: 9, marginTop: 2, opacity: 0.85 }}>Preferred · DAS + Track tokens</div>
              </button>
              <button onClick={() => setAuthPath("B")} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${authPath === "B" ? T.blue : T.border}`, background: authPath === "B" ? T.blueLight : "transparent", color: authPath === "B" ? T.blue : T.textSecondary, fontSize: 10, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>(B) Username + Password</div>
                <div style={{ fontSize: 9, marginTop: 2, opacity: 0.85 }}>Legacy fallback</div>
              </button>
            </div>
          </div>

          {authPath === "A" ? (
            <>
              <Input label="DAS Web Token (REST API)" value="••••••••••••••••••••••••••••••••••••••••" type="password" />
              <Input label="ER Track Token (SocketIO WebSocket)" value="••••••••••••••••••••••••••••••••••••••••" type="password" />
            </>
          ) : (
            <>
              <Input label="Username" value="service_account_banggai" />
              <Input label="Password" value="••••••••" type="password" />
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "8px 10px", background: T.greenBg, borderRadius: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
            <span style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>{testResult}</span>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <Btn primary small>Save</Btn>
            <Btn small>Test Connection</Btn>
            <Btn small>Verify ER Limits</Btn>
          </div>

          {verifyResult.done && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: T.elevated, borderRadius: 6, border: `1px solid ${T.cyan}30` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.cyan, letterSpacing: 0.5, marginBottom: 4 }}>VERIFIED LIMITS (last run {verifyResult.when})</div>
              <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.5 }}>
                Max page_size honored: <strong style={{ color: T.text }}>{verifyResult.page}</strong> · Rate-limit headers: <strong style={{ color: T.text }}>{verifyResult.headers ? "yes" : "no"}</strong> · Concurrent cap: <strong style={{ color: T.text }}>4</strong>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <ST>Sync Intervals</ST>
          <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>
            Two-loop sync engine. Active Check pulls newest records frequently; Deep Sync reconciles full history less often.
          </div>
          <Input label="Active Check Interval (seconds — floor 60, ceiling 3600)" value="120" />
          <Input label="Deep Sync Interval (seconds — floor 300, ceiling 86400)" value="600" />
          <Input label="Request Timeout (ms)" value="30000" />
          <div style={{ marginTop: 10, padding: "8px 10px", background: T.elevated, borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: T.text, fontWeight: 600 }}>📊 Real-time status →</div>
            <div style={{ fontSize: 10, color: T.cyan, marginTop: 4 }}>See <strong>Tenant Settings / Sync Health</strong> for last_error, sync_state, and per-data-type breakdown</div>
          </div>
        </Card>

        <Card>
          <ST>Tenant Profile</ST>
          <Input label="MPA Site Name" value="Banggai Marine Protected Area" />
          <Input label="Slug" value="banggai" />
          <Input label="Timezone" value="Asia/Makassar (WITA)" />
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 500, color: T.textSecondary, display: "block", marginBottom: 4 }}>Currency</label>
            <select style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, boxSizing: "border-box" }}><option value="IDR">IDR — Indonesian Rupiah (Rp)</option><option value="PHP">PHP — Philippine Peso (₱)</option><option value="MYR">MYR — Malaysian Ringgit (RM)</option></select>
          </div>
          <Btn primary small>Update</Btn>
        </Card>

        <Card>
          <ST>External References</ST>
          <Input label="ArcGIS Boundary URL (reference-only, optional)" value="" placeholder="(Banggai has no ArcGIS reference — leave blank)" />
          <Input label="ArcGIS outFields (comma-separated)" value="" placeholder="e.g., municipali,province" />
          <div style={{ marginTop: 8, padding: "8px 10px", background: T.elevated, borderRadius: 6, fontSize: 9, color: T.textMuted, lineHeight: 1.5 }}>
            ArcGIS layer is shown in Area Boundaries editor as a <strong style={{ color: T.cyan }}>dashed cyan reference outline</strong> only. Never queried at report time. App-managed boundaries are the source of truth.
          </div>
        </Card>
      </div>
    </div>
  );
};

const SuperAdmin = () => (<div><Mb s="Mobile Ready" /><PT right={<Btn primary>+ Onboard MPA</Btn>}>Super Admin — Tenants</PT><Card style={{ padding: 0, overflow: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><TR h><TD h>MPA Site</TD><TD h>Slug</TD><TD h a="center">Users</TD><TD h a="center">Events</TD><TD h>Last Sync</TD><TD h>Status</TD><TD h>Actions</TD></TR></thead><tbody>{[{ n: "Banggai MPA", s: "/banggai", u: 5, ev: 47, ls: "5s ago" }, { n: "Mindoro MPA", s: "/mindoro", u: 8, ev: 32, ls: "12s ago" }, { n: "Pecca MPA", s: "/pecca", u: 3, ev: 12, ls: "3m ago" }].map((t, i) => <TR key={i}><TD><strong>{t.n}</strong></TD><TD><code style={{ fontSize: 10, color: T.blue }}>{t.s}</code></TD><TD a="center">{t.u}</TD><TD a="center">{t.ev}</TD><TD>{t.ls}</TD><TD><Badge color="green">Active</Badge></TD><TD><Btn small>Manage</Btn></TD></TR>)}</tbody></table></Card><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>{[["Tenants", "3"], ["Users", "16"], ["Events (30d)", "91"]].map(([l, v], i) => <Card key={i} style={{ padding: 10, textAlign: "center" }}><div style={{ fontSize: 9, color: T.textMuted }}>{l}</div><div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{v}</div></Card>)}</div></div>);

const FuelLogging = () => (<div><Mb s="Mobile First" /><PT right={<Btn primary>+ Log Fuel Receipt</Btn>}>Fuel Logging & Consumption — Banggai MPA</PT>
  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
    {[{ l: "TOTAL LITERS (DEC)", v: "2,450 L", c: T.blue }, { l: "TOTAL COST (DEC)", v: "Rp 12,740,000", c: T.orange }, { l: "SEABORNE KM (DEC)", v: "2,907 km", c: T.cyan }, { l: "AVG CONSUMPTION", v: "0.843 L/km", c: T.green }].map((k, i) => (
      <Card key={i} style={{ flex: 1, minWidth: 140, padding: 14 }}><div style={{ fontSize: 8, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5 }}>{k.l}</div><div style={{ fontSize: 20, fontWeight: 800, color: k.c, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{k.v}</div></Card>
    ))}
  </div>
  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
    <Card><ST>Fuel Log Entries</ST>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}><Sel><option>All Areas</option><option>A5</option><option>A6</option><option>A7</option><option>Area 12</option><option>L806</option></Sel><Sel><option>December 2025</option><option>November 2025</option></Sel></div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><TR h><TD h>Date</TD><TD h>Area</TD><TD h a="right">Liters</TD><TD h a="right">Cost (IDR)</TD><TD h>Logged By</TD><TD h>Receipt</TD><TD h>Notes</TD></TR></thead><tbody>
        {[
          { d: "Dec 28", a: "Area 12", l: "500", c: "Rp 2,600,000", by: "Saldi", r: true, n: "Pertamina diesel" },
          { d: "Dec 22", a: "A6", l: "350", c: "Rp 1,820,000", by: "Sri", r: true, n: "Monthly allocation" },
          { d: "Dec 20", a: "Area 12", l: "400", c: "Rp 2,080,000", by: "Pottoli Tobin 4", r: false, n: "Emergency top-up" },
          { d: "Dec 15", a: "A7", l: "300", c: "Rp 1,560,000", by: "PKM Togong", r: true, n: "Bi-weekly supply" },
          { d: "Dec 10", a: "A6", l: "450", c: "Rp 2,340,000", by: "Adrianto", r: true, n: "Monthly allocation" },
          { d: "Dec 5", a: "Area 12", l: "250", c: "Rp 1,300,000", by: "Adhi Zulfikri", r: false, n: "Patrol supply" },
          { d: "Dec 1", a: "A7", l: "200", c: "Rp 1,040,000", by: "Saldi", r: true, n: "Start of month" },
        ].map((e, i) => <TR key={i}><TD>{e.d}</TD><TD>{e.a}</TD><TD a="right"><strong>{e.l}</strong></TD><TD a="right">{e.c}</TD><TD><span style={{ color: T.blue, fontSize: 10 }}>{e.by}</span></TD><TD>{e.r ? <Badge color="green">📷</Badge> : <span style={{ color: T.textMuted }}>—</span>}</TD><TD><span style={{ fontSize: 10, color: T.textSecondary }}>{e.n}</span></TD></TR>)}
      </tbody></table>
    </Card>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card><ST>Consumption by Area</ST>
        {[{ a: "Area 12", l: 1150, km: 2127, rate: "0.541" }, { a: "A6", l: 800, km: 520, rate: "1.538" }, { a: "A7", l: 500, km: 260, rate: "1.923" }].map((r, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{r.a}</span><span style={{ fontSize: 11, fontWeight: 700, color: T.cyan }}>{r.rate} L/km</span></div>
            <div style={{ fontSize: 9, color: T.textMuted }}>{r.l}L received · {r.km} km patrolled</div>
          </div>
        ))}
      </Card>
      <Card><ST>Trend — Avg L/km (Monthly)</ST>
        <div style={{ display: "flex", alignItems: "end", gap: 6, height: 80, padding: "8px 0" }}>
          {[{ m: "Sep", v: 0.92 }, { m: "Oct", v: 0.87 }, { m: "Nov", v: 0.78 }, { m: "Dec", v: 0.84 }].map((b, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 8, color: T.cyan, fontWeight: 600 }}>{b.v}</span>
              <div style={{ width: "100%", height: `${b.v * 70}px`, background: T.cyan + "40", borderRadius: "3px 3px 0 0", border: `1px solid ${T.cyan}60` }} />
              <span style={{ fontSize: 8, color: T.textMuted }}>{b.m}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card style={{ padding: 14 }}><ST>📤 New Fuel Entry</ST>
        <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 8 }}>Quick-log form for field use</div>
        <Input label="Area" placeholder="Select area..." />
        <Input label="Liters Received" placeholder="e.g., 500" />
        <Input label="Total Cost (Rp)" placeholder="e.g., 2600000" />
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, fontWeight: 500, color: T.textSecondary, display: "block", marginBottom: 4 }}>Receipt Photo</label>
          <div style={{ border: `2px dashed ${T.border}`, borderRadius: 8, padding: "14px 10px", textAlign: "center", cursor: "pointer" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>📷</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>Tap to capture or upload receipt</div>
          </div>
        </div>
        <Input label="Notes" placeholder="Supplier, details..." />
        <Btn primary>Submit Fuel Entry</Btn>
      </Card>
    </div>
  </div>
</div>);

// ──────────────────────────────────────────────────────────────
// ★★ V5 NEW SCREENS — Phase 2.8 v6: SPEC.md adoption + blocking gap resolutions
// ──────────────────────────────────────────────────────────────

// ──── AREA BOUNDARY EDITOR ★★ ────
const AreaBoundaries = () => {
  const [selected, setSelected] = useState(0);
  const munis = [
    { name: "Apo Reef Park", region: "Mindoro", aliases: "apo reef, apo reef natural park", source: "custom", enabled: true, override: true, hasOfficial: true },
    { name: "Calapan", region: "Mindoro", aliases: "calapan city", source: "custom", enabled: true, override: false, hasOfficial: true },
    { name: "Puerto Galera", region: "Mindoro", aliases: "puerto, pg", source: "custom", enabled: true, override: true, hasOfficial: true },
    { name: "Baco", region: "Mindoro", aliases: "", source: "official", enabled: true, override: false, hasOfficial: true },
    { name: "San Teodoro", region: "Mindoro", aliases: "", source: "official", enabled: false, override: false, hasOfficial: true },
    { name: "Sablayan", region: "Mindoro", aliases: "", source: "custom", enabled: true, override: true, hasOfficial: true },
  ];
  const cur = munis[selected];
  return (
    <div><Mb s="Mobile Ready" />
      <PT right={<div style={{ display: "flex", gap: 5 }}><Sel><option>Mindoro</option><option>Palawan</option></Sel><Btn primary>+ New Boundary</Btn></div>}>Area Boundaries</PT>

      <Card style={{ marginBottom: 12, borderLeft: `3px solid ${T.cyan}`, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>🗺️</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Reference vs Source of Truth</span>
        </div>
        <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.6 }}>
          <strong style={{ color: T.cyan }}>ArcGIS lines (dashed cyan)</strong> are <strong style={{ color: T.text }}>reference only</strong> — shown during editing as a visual guide. You can follow them, modify them, or ignore them. The <strong style={{ color: T.text }}>filled cyan polygon</strong> is your saved geometry — the single source of truth for all reports and coverage analytics. ArcGIS is never consulted at report time.
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <Card style={{ padding: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6 }}>
            <ST>📍 Mindoro Region</ST>
            <span style={{ marginLeft: "auto", fontSize: 9, color: T.textMuted }}>{munis.length} boundaries</span>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {munis.map((m, i) => (
              <div key={i} onClick={() => setSelected(i)} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: i === selected ? T.blueLight : "transparent", borderLeft: i === selected ? `3px solid ${T.blue}` : "3px solid transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: i === selected ? T.blue : T.text }}>{m.name}</span>
                  {!m.enabled && <Badge color="muted">disabled</Badge>}
                  {m.override && <Badge color="orange">override</Badge>}
                </div>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{m.aliases || <em>no aliases</em>}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: 8, color: T.textMuted }}>
                  {m.source === "custom" ? <span style={{ color: T.cyan }}>● App-managed</span> : <span style={{ color: T.textMuted }}>○ ArcGIS only</span>}
                  {m.hasOfficial && <span> · ArcGIS ref available</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <Card style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center" }}>
              <ST>{cur.name} — Boundary Editor</ST>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <Btn small>Undo Last Point</Btn>
                <Btn small>Clear Draft</Btn>
                {cur.hasOfficial && <Btn small primary>📋 Copy Official → Draft</Btn>}
              </div>
            </div>
            <div style={{ background: T.elevated, height: 280, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #0d1b2a, #1b2838, #162230)" }} />
              <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(24,25,26,0.85)", borderRadius: 5, padding: "4px 8px", zIndex: 2, fontSize: 9, color: T.textSecondary }}>🗺️ MapLibre GL · Click to add vertex</div>
              <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(24,25,26,0.85)", borderRadius: 5, padding: "5px 8px", zIndex: 2, fontSize: 9, color: T.text, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 2, background: T.cyan, borderTop: `1px dashed ${T.cyan}` }} /> ArcGIS reference (read-only)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 8, background: T.cyan, opacity: 0.3, border: `1px solid ${T.cyan}` }} /> App-managed geometry</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: T.blue }} /> Editable vertex (12 pts)</div>
              </div>
              <svg style={{ position: "absolute", inset: 0, zIndex: 1 }} viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* ArcGIS reference — dashed cyan outline */}
                <polygon points="22,30 48,22 72,28 78,50 70,68 45,72 25,62 18,45" fill="none" stroke={T.cyan} strokeWidth="0.3" strokeDasharray="2,1.2" opacity="0.7" />
                {/* App-managed polygon — filled cyan */}
                <polygon points="25,33 50,25 70,32 74,52 65,66 47,70 28,60 22,46" fill={T.cyan} fillOpacity="0.18" stroke={T.cyan} strokeWidth="0.4" opacity="0.9" />
                {/* Vertex dots */}
                {[[25,33],[50,25],[70,32],[74,52],[65,66],[47,70],[28,60],[22,46]].map(([x,y], i) => <circle key={i} cx={x} cy={y} r="0.8" fill={T.blue} stroke="#fff" strokeWidth="0.2" />)}
              </svg>
            </div>
          </Card>

          <Card>
            <ST>Boundary Details</ST>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Name" value={cur.name} />
              <Input label="Region" value={cur.region} />
            </div>
            <Input label="Aliases (comma-separated, for fuzzy match against patrol locations)" value={cur.aliases} placeholder="e.g., apo reef, apo reef park" />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text, cursor: "pointer" }}>
                <input type="checkbox" defaultChecked={cur.enabled} style={{ accentColor: T.blue }} />
                Enabled (include in reports)
              </label>
              {cur.override && (
                <div style={{ padding: "3px 8px", borderRadius: 4, background: T.orangeBg, color: T.orange, fontSize: 9, fontWeight: 600 }}>
                  ⚠ override_official = true (≥3 vertices saved)
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "flex-end" }}>
              <Btn>Discard Changes</Btn>
              <Btn primary>Save Boundary</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ──── PATROL COVERAGE TEMPLATE REPORT (3-page preview) ★★ ────
const CoverageReport = () => {
  const [period, setPeriod] = useState("monthly");
  return (
    <div><Mb s="Mobile Ready" />
      <PT right={<div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <Sel><option>A4</option><option>Letter</option><option>Legal</option></Sel>
        <Btn primary>📄 Generate 3-Page PDF</Btn>
      </div>}>Patrol Coverage Report (Template)</PT>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>📅</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Period Selection</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[["weekly", "📅 Weekly", "Week 19 (May 4–10, 2026)"], ["monthly", "🗓️ Monthly", "MAY 2026"], ["annual", "📆 Annual", "2026 ANNUAL"]].map(([k, l, sub]) => (
            <button key={k} onClick={() => setPeriod(k)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${period === k ? T.blue : T.border}`, background: period === k ? T.blueLight : "transparent", color: period === k ? T.blue : T.text, cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{sub}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: T.text, cursor: "pointer" }}>
            <input type="checkbox" defaultChecked style={{ accentColor: T.blue }} /> Exclude test patrols (regex /test|qa|demo/i)
          </label>
          <span style={{ color: T.textMuted }}>·</span>
          <span style={{ color: T.textSecondary }}>Last Completed Week defaulted</span>
        </div>
      </Card>

      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 1, marginBottom: 6 }}>━ PAGE 1 OF 3 — PATROL INDEX</div>
      <Card style={{ padding: 14, marginBottom: 12, background: "#fff", color: "#000" }}>
        <div style={{ borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#000" }}>🌊 Marine Guardian — Banggai MPA</div>
            <div style={{ fontSize: 11, color: "#444" }}>Patrol Coverage Report — MAY 2026</div>
          </div>
          <div style={{ fontSize: 9, color: "#666", textAlign: "right" }}>
            <div>Generated: Sun, May 17, 2026 09:47 WITA</div>
            <div>Excludes test patrols</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          {[["FOOT", "23", "187 km"], ["SEABORNE", "41", "2,127 km"], ["TOTAL", "64", "2,314 km"]].map(([l, v, k], i) => (
            <div key={i} style={{ padding: 10, border: "1px solid #ccc", borderRadius: 4, textAlign: "center" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "#555", letterSpacing: 1 }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#000" }}>{v}</div>
              <div style={{ fontSize: 9, color: "#444" }}>{k}</div>
            </div>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, color: "#000" }}>
          <thead><tr style={{ background: "#eee" }}>
            {["Serial", "Title", "Type", "Status", "Tracked By", "Start", "End", "Hrs", "KMS", "Objective"].map((h, i) => <th key={i} style={{ padding: "4px 6px", textAlign: "left", borderBottom: "1px solid #999", fontSize: 8, fontWeight: 700 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[
              ["#501", "Sombuan Patrol", "Seaborne", "Done", "Pottoli Tobin 2", "May 14 06:00", "May 14 12:12", "6.2", "87.3", "Coral monitoring + LE"],
              ["#502", "Solan Bajo Sweep", "Seaborne", "Done", "Pottoli Tobin 4", "May 15 05:30", "May 15 11:45", "6.3", "92.1", "Blast fishing response"],
              ["#503", "Tulus Reef Foot", "Foot", "Done", "Adrianto", "May 16 07:00", "May 16 11:30", "4.5", "18.4", "Beach + intertidal"],
              ["#504", "Palagang Area 7", "Seaborne", "Done", "Saldi", "May 16 14:00", "May 16 19:30", "5.5", "78.2", "Routine boundary"],
              ["…", "(+60 more rows)", "—", "—", "—", "—", "—", "—", "—", "—"],
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                {r.map((c, j) => <td key={j} style={{ padding: "3px 6px", fontSize: 9 }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 1, marginBottom: 6 }}>━ PAGE 2 OF 3 — AREA BOUNDARY SUMMARY</div>
      <Card style={{ padding: 14, marginBottom: 12, background: "#fff", color: "#000" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, color: "#000" }}>
            <thead><tr style={{ background: "#eee" }}>
              <th style={{ padding: "4px 6px", textAlign: "left", borderBottom: "1px solid #999", fontSize: 8 }}>Area Boundary</th>
              <th style={{ padding: "4px 6px", textAlign: "right", borderBottom: "1px solid #999", fontSize: 8 }}>Patrols</th>
            </tr></thead>
            <tbody>
              {[["Solan Bajo", 18], ["Tulus Reef", 14], ["Palagang", 12], ["Sombuan", 9], ["Apo Reef Park", 7], ["Calapan", 3], ["Outside boundaries", 1]].map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={{ padding: "4px 6px" }}>{r[0]}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>{r[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ background: "#e8f4f8", borderRadius: 4, height: 180, position: "relative", overflow: "hidden", border: "1px solid #ccc" }}>
            <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(255,255,255,0.9)", padding: "3px 6px", borderRadius: 3, fontSize: 8, color: "#333" }}>📍 Patrol tracks + boundaries</div>
            <svg style={{ position: "absolute", inset: 0 }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon points="20,30 45,22 65,30 70,55 50,68 25,60" fill="#00c9db" fillOpacity="0.2" stroke="#00c9db" strokeWidth="0.4" />
              <polygon points="55,15 80,18 85,40 70,45 58,30" fill="#00c9db" fillOpacity="0.2" stroke="#00c9db" strokeWidth="0.4" />
              <polyline points="25,52 35,40 50,38 58,45 65,50" fill="none" stroke="#0866ff" strokeWidth="0.4" opacity="0.7" />
              <polyline points="28,55 40,48 50,52 60,55" fill="none" stroke="#0866ff" strokeWidth="0.4" opacity="0.7" />
              <polygon points="22,30 48,22 72,28 78,50 70,68 45,72 25,62" fill="none" stroke="#888" strokeWidth="0.2" strokeDasharray="1,0.6" opacity="0.5" />
            </svg>
          </div>
        </div>
        <div style={{ marginTop: 8, padding: "6px 8px", background: "#fff8e1", border: "1px solid #f0c360", borderRadius: 3, fontSize: 9, color: "#664400" }}>
          <strong>ℹ Variance Info:</strong> 1 patrol started outside all enabled area boundaries. Coverage attribution uses the nearest enabled boundary to each track segment's midpoint.
        </div>
      </Card>

      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 1, marginBottom: 6 }}>━ PAGE 3 OF 3 — AREA COVERED (the headline analytic)</div>
      <Card style={{ padding: 14, marginBottom: 12, background: "#fff", color: "#000" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, color: "#000" }}>
          <thead><tr style={{ background: "#eee" }}>
            <th style={{ padding: "5px 6px", textAlign: "left", borderBottom: "1px solid #999", fontSize: 9 }}>Boundary</th>
            <th style={{ padding: "5px 6px", textAlign: "right", borderBottom: "1px solid #999", fontSize: 9 }}>Patrols</th>
            <th style={{ padding: "5px 6px", textAlign: "right", borderBottom: "1px solid #999", fontSize: 9 }}>Coverage KMS</th>
            <th style={{ padding: "5px 6px", textAlign: "right", borderBottom: "1px solid #999", fontSize: 9 }}>Coverage HRS</th>
          </tr></thead>
          <tbody>
            {[
              ["Solan Bajo", 18, "732.4", "52.3", false],
              ["Tulus Reef", 14, "468.1", "33.7", false],
              ["Palagang", 12, "412.8", "29.5", true],
              ["Sombuan", 9, "287.5", "20.1", true],
              ["Apo Reef Park", 7, "245.6", "18.4", false],
              ["Calapan", 3, "67.2", "4.8", false],
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "5px 6px", fontWeight: 500 }}>{r[0]}</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>{r[1]}</td>
                <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 600 }}>{r[2]}</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                  {r[3]}
                  {r[4] && <span style={{ marginLeft: 4, padding: "1px 5px", background: "#f0c360", color: "#664400", borderRadius: 3, fontSize: 8, fontWeight: 700 }}>Est.</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10, padding: "6px 8px", fontSize: 9, color: "#444", borderTop: "1px dashed #ccc", paddingTop: 8 }}>
          <strong>Est.</strong> = hours pro-rated from total patrol duration (per-point timestamps missing or length-mismatched). · 2 patrols had missing tracks (excluded from this table). · Computed via `Math.abs(t1-t0)` per segment — newest-first time order from EarthRanger handled explicitly.
        </div>
      </Card>
    </div>
  );
};

// ──── ALERT RULE FORM (kind-picker) ★★ ────
const AlertRuleForm = () => {
  const [kind, setKind] = useState("event_match");
  const kindMeta = {
    event_match: { label: "Event match", icon: "⚠️", desc: "Fires when a synced event matches all specified filters" },
    subject_stale: { label: "Subject stale", icon: "📡", desc: "Fires when a tracked subject hasn't reported a position in N minutes" },
    patrol_overdue: { label: "Patrol overdue", icon: "⏰", desc: "Fires when a scheduled patrol hasn't started by deadline" },
    sync_failure: { label: "Sync failure", icon: "🔄", desc: "Fires when sync has been failing for N minutes" },
  };
  return (
    <div><Mb s="Mobile Ready" />
      <div style={{ fontSize: 10, color: T.textMuted, margin: "10px 0 5px" }}>Alert Rules / New Rule</div>
      <PT right={<div style={{ display: "flex", gap: 5 }}><Btn>Cancel</Btn><Btn primary>Save Rule</Btn></div>}>Configure Alert Rule</PT>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div>
          <Card style={{ marginBottom: 12 }}>
            <ST>Rule Kind (typed condition schema)</ST>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(kindMeta).map(([k, m]) => (
                <button key={k} onClick={() => setKind(k)} style={{ padding: 12, borderRadius: 8, border: `1px solid ${kind === k ? T.blue : T.border}`, background: kind === k ? T.blueLight : "transparent", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{m.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: kind === k ? T.blue : T.text }}>{m.label}</span>
                    {kind === k && <Badge color="blue">selected</Badge>}
                  </div>
                  <div style={{ fontSize: 9, color: T.textMuted, lineHeight: 1.4 }}>{m.desc}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <ST>Condition — <span style={{ color: T.cyan, fontWeight: 500 }}>{kindMeta[kind].label}</span></ST>
            {kind === "event_match" && <>
              <Input label="Event types (leave empty for any)" placeholder="e.g., destructive_practices, compressor_fishing" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={{ fontSize: 10, fontWeight: 500, color: T.textSecondary, display: "block", marginBottom: 4 }}>Minimum priority</label><select style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, boxSizing: "border-box" }}><option>critical</option><option>high</option><option>medium</option><option>low</option></select></div>
                <div><label style={{ fontSize: 10, fontWeight: 500, color: T.textSecondary, display: "block", marginBottom: 4 }}>States</label><select style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, boxSizing: "border-box" }}><option>new (first sighting only)</option><option>new, active</option><option>any</option></select></div>
              </div>
              <Input label="Categories (leave empty for any)" placeholder="law_enforcement, monitoring" />
              <Input label="Areas (leave empty for any)" placeholder="A12a, A7" />
            </>}
            {kind === "subject_stale" && <>
              <Input label="Subject types (leave empty for any)" placeholder="person, vehicle" />
              <Input label="Threshold minutes" value="1440" type="number" />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text, marginTop: 6 }}>
                <input type="checkbox" style={{ accentColor: T.blue }} /> Fire only when subject is on an active patrol
              </label>
            </>}
            {kind === "patrol_overdue" && <>
              <Input label="Grace minutes (how late before alert fires)" value="60" type="number" />
              <div><label style={{ fontSize: 10, fontWeight: 500, color: T.textSecondary, display: "block", marginBottom: 4 }}>Patrol types</label><select style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, boxSizing: "border-box" }}><option>Any</option><option>Foot only</option><option>Seaborne only</option></select></div>
            </>}
            {kind === "sync_failure" && <>
              <Input label="Threshold minutes" value="10" type="number" />
              <Input label="Data types (leave empty for any)" placeholder="patrols, observations" />
            </>}
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <ST>Recipients</ST>
            <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 8 }}>Who gets this alert?</div>
            <div style={{ marginBottom: 8 }}>
              {["All Site Admins", "All Field Coordinators", "Operator Siti"].map((r, i) => (
                <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 16, background: T.blueLight, border: `1px solid ${T.blue}40`, fontSize: 10, color: T.blue, marginRight: 5, marginBottom: 4 }}>
                  {r.includes("All") ? "👥" : "👤"} {r}
                  <span style={{ cursor: "pointer", marginLeft: 4, color: T.textMuted, fontSize: 12 }}>×</span>
                </div>
              ))}
            </div>
            <select style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 11, boxSizing: "border-box" }}>
              <option>+ Add role or user...</option>
              <option>Role: All Operators</option>
              <option>User: Coordinator Ahmad</option>
              <option>User: Site Admin Budi</option>
            </select>
          </Card>

          <Card>
            <ST>Channels</ST>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text, marginBottom: 6, cursor: "pointer" }}>
              <input type="checkbox" defaultChecked style={{ accentColor: T.blue }} /> 🔔 In-app notification
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text, cursor: "pointer" }}>
              <input type="checkbox" defaultChecked style={{ accentColor: T.blue }} /> ✉️ Email
            </label>
          </Card>

          <Card>
            <ST>Storm Prevention</ST>
            <Input label="Cooldown (minutes)" value="5" type="number" />
            <div style={{ fontSize: 9, color: T.textMuted, lineHeight: 1.5, marginTop: 4 }}>
              In-app notifications always fire. Within the cooldown window, additional email matches accumulate and digest into one email at expiry. Set to 0 for no batching (critical events).
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ──── SYNC HEALTH (embedded in Tenant Settings) ★★ ────
const SyncHealth = () => {
  const [state, setState] = useState("running"); // running | rate_limited | auth_failed | manual_pause
  const states = [
    { id: "running", label: "Running", color: T.green, bg: T.greenBg, icon: "🟢" },
    { id: "rate_limited", label: "Rate Limited", color: T.yellow, bg: T.yellowBg, icon: "🟡" },
    { id: "auth_failed", label: "Auth Failed", color: T.red, bg: T.redBg, icon: "🔴" },
    { id: "manual_pause", label: "Manually Paused", color: T.textMuted, bg: T.elevated, icon: "⏸️" },
  ];
  const cur = states.find(s => s.id === state);

  const banners = {
    running: { title: "Sync Engine Running", body: "Two-loop model: Active Check + Deep Sync. last_error: null. auth_failure_count: 0." },
    rate_limited: { title: "Sync Paused — Rate Limited by EarthRanger", body: "ER returned HTTP 429 with Retry-After: 60s. Sync queues paused until 12:47:33 UTC. Resumes automatically — no action needed unless persistent." },
    auth_failed: { title: "Sync Stopped — Authentication Failed", body: "2 consecutive 401 responses tripped the auth-failure circuit breaker. Both Active Check and Deep Sync timers are stopped. Update credentials in Tenant Settings → click Test Connection. Sync resumes on first successful test." },
    manual_pause: { title: "Sync Paused — Manually Stopped", body: "Site Admin paused the sync engine. Click 'Resume Sync' below to restart. No new data is pulled from EarthRanger while paused." },
  };
  const b = banners[state];

  return (
    <div><Mb s="Mobile Ready" />
      <div style={{ fontSize: 10, color: T.textMuted, margin: "10px 0 5px" }}>Tenant Settings / Sync Health</div>
      <PT right={
        <div style={{ display: "flex", gap: 5 }}>
          {state === "manual_pause"
            ? <Btn primary small>▶ Resume Sync</Btn>
            : state === "auth_failed"
              ? <Btn primary small>Open Tenant Settings →</Btn>
              : <>
                  <Btn small>Reset Cache</Btn>
                  <Btn primary small>⟳ Force Resync</Btn>
                </>
          }
        </div>
      }>Sync Health — Banggai</PT>

      {/* State cycler for v6 demo */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, padding: "6px 10px", background: T.surface, borderRadius: 8, border: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, alignSelf: "center", letterSpacing: 0.5 }}>DEMO STATE →</span>
        {states.map(s => (
          <button key={s.id} onClick={() => setState(s.id)} style={{ padding: "4px 10px", borderRadius: 14, border: `1px solid ${state === s.id ? s.color : T.border}`, background: state === s.id ? s.bg : "transparent", color: state === s.id ? s.color : T.textSecondary, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>{s.icon} {s.label}</button>
        ))}
      </div>

      <Card style={{ marginBottom: 12, borderLeft: `3px solid ${cur.color}`, padding: 14, background: cur.bg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: cur.color, boxShadow: `0 0 6px ${cur.color}` }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: cur.color }}>{b.title}</span>
          <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "monospace", color: T.textMuted }}>sync_state = "{state}"</span>
        </div>
        <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}>{b.body}</div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ padding: 12, background: T.surface, borderRadius: 8, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5 }}>ACTIVE CHECK INTERVAL</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: state === "running" ? T.cyan : T.textMuted, marginTop: 4 }}>{state === "running" ? "Every 2 min" : state === "rate_limited" ? "Paused 47s" : "Stopped"}</div>
          <div style={{ fontSize: 10, color: T.textSecondary, marginTop: 4, lineHeight: 1.4 }}>5 pages × 100 patrols + 50 candidate refreshes. Last run: <strong style={{ color: T.text }}>{state === "running" ? "32s ago" : state === "rate_limited" ? "47s ago (paused)" : state === "auth_failed" ? "4m ago (stopped at 401)" : "12m ago (paused)"}</strong>.</div>
        </div>
        <div style={{ padding: 12, background: T.surface, borderRadius: 8, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5 }}>DEEP SYNC INTERVAL</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: state === "running" ? T.blue : T.textMuted, marginTop: 4 }}>{state === "running" ? "Every 10 min" : "Stopped"}</div>
          <div style={{ fontSize: 10, color: T.textSecondary, marginTop: 4, lineHeight: 1.4 }}>Full history pagination (100 × 200). Reconciles deletions. Last run: <strong style={{ color: T.text }}>{state === "running" ? "4m ago" : "stopped"}</strong>.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Card>
          <ST>Cache Stats</ST>
          {[
            ["Total patrols cached", "2,847", T.text],
            ["Sync candidates (active)", "6", T.orange],
            ["Patrol tracks materialized", "2,791", T.text],
            ["auth_failure_count", state === "auth_failed" ? "2 (tripped)" : "0", state === "auth_failed" ? T.red : T.text],
            ["Last cache update", state === "running" ? "32s ago" : "stale", state === "running" ? T.cyan : T.textMuted],
          ].map(([l, v, c], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 4 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ fontSize: 11, color: T.textSecondary }}>{l}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{v}</span>
            </div>
          ))}
        </Card>

        <Card>
          <ST>Last Error</ST>
          {state === "running" && (
            <div style={{ padding: 10, background: T.greenBg, borderRadius: 6, border: `1px solid ${T.green}40` }}>
              <div style={{ fontSize: 11, color: T.green, fontWeight: 600 }}>✓ No errors</div>
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>Last failure cleared 6 hours ago. Sync workers never propagate errors to event loop — failures stored in last_error and queue retries.</div>
            </div>
          )}
          {state === "rate_limited" && (
            <div style={{ padding: 10, background: T.yellowBg, borderRadius: 6, border: `1px solid ${T.yellow}40` }}>
              <div style={{ fontSize: 11, color: T.yellow, fontWeight: 600 }}>HTTP 429 Too Many Requests</div>
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>Retry-After: 60s. paused_until = 2026-01-12T12:47:33Z. Resumes automatically. If persistent, increase Active Check Interval in Tenant Settings.</div>
            </div>
          )}
          {state === "auth_failed" && (
            <div style={{ padding: 10, background: T.redBg, borderRadius: 6, border: `1px solid ${T.red}40` }}>
              <div style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>HTTP 401 Unauthorized (×2 consecutive)</div>
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>Circuit breaker tripped. Most likely cause: token expired or rotated in ER Admin. Update DAS Web Token in Tenant Settings → Test Connection → sync resumes automatically on success.</div>
            </div>
          )}
          {state === "manual_pause" && (
            <div style={{ padding: 10, background: T.elevated, borderRadius: 6, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>⏸️ Paused by Site Admin</div>
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>Paused at 2026-01-12T12:35:00Z by ahmad@banggai.org. Reason: "Scheduled ER maintenance window." No automatic resume — Site Admin must click ▶ Resume Sync.</div>
            </div>
          )}
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: "auto" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
          <ST>Per-Data-Type Sync Status</ST>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><TR h><TD h>Data Type</TD><TD h>Last Sync</TD><TD h a="right">Records</TD><TD h>Status</TD><TD h>Error</TD></TR></thead>
          <tbody>
            {[
              { t: "Subjects", l: state === "running" ? "12s ago" : state === "rate_limited" ? "47s ago" : "4m ago", n: 47, s: state === "running" ? "success" : state === "auth_failed" ? "failed" : "partial" },
              { t: "Events", l: state === "running" ? "32s ago" : "stale", n: 22, s: state === "running" ? "success" : "failed" },
              { t: "Patrols", l: state === "running" ? "32s ago" : "stale", n: 64, s: state === "running" ? "success" : "failed" },
              { t: "Observations", l: state === "running" ? "12s ago" : "stale", n: 1842, s: state === "running" ? "success" : "failed" },
              { t: "Event Types", l: "4m ago", n: 18, s: "success" },
              { t: "Subject Groups", l: "4m ago", n: 6, s: "success" },
              { t: "Patrol Tracks", l: state === "running" ? "1m ago" : "stale", n: 8, s: state === "running" ? "partial" : "failed", e: state === "running" ? "2 tracks: 404 (subject deleted upstream)" : state === "auth_failed" ? "401 — token rejected" : "429 — rate limited" },
            ].map((r, i) => (
              <TR key={i}>
                <TD><strong>{r.t}</strong></TD>
                <TD><span style={{ color: r.l === "stale" ? T.red : T.text }}>{r.l}</span></TD>
                <TD a="right">{r.n}</TD>
                <TD><Badge color={r.s === "success" ? "green" : r.s === "partial" ? "orange" : "red"}>{r.s}</Badge></TD>
                <TD><span style={{ fontSize: 10, color: r.e ? T.orange : T.textMuted }}>{r.e || "—"}</span></TD>
              </TR>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ marginTop: 12, padding: 14 }}>
        <ST>Sync Failure Banner Logic</ST>
        <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.6 }}>
          Banner "SYNC FAILED" appears at the top of every tenant page when (a) <strong style={{ color: T.text }}>3 consecutive sync attempts have failed</strong>, OR (b) the last successful sync is older than <strong style={{ color: T.text }}>active_check_interval_seconds × 5 (= 600s default)</strong>, whichever comes first. Banner clears on first successful sync.
        </div>
        <div style={{ fontSize: 10, color: T.textSecondary, marginTop: 8, lineHeight: 1.6 }}>
          EarthRanger 429 responses → <code style={{ color: T.yellow }}>sync_state = "rate_limited"</code> per Retry-After header (60s default). 2 consecutive 401s → <code style={{ color: T.red }}>sync_state = "auth_failed"</code> circuit breaker trips. See PRODUCT.md § ER Resilience.
        </div>
      </Card>
    </div>
  );
};

// ──── SUPER ADMIN IMPERSONATION (banner state demo) ★★ ────
const SuperAdminImpersonation = () => {
  const [mode, setMode] = useState("readonly");
  const [showModal, setShowModal] = useState(false);
  return (
    <div><Mb s="Mobile Ready" />
      <div style={{ fontSize: 10, color: T.textMuted, margin: "10px 0 5px" }}>Super Admin / Managing Banggai (Impersonation Mode Demo)</div>

      {mode === "readonly" && (
        <div style={{ background: T.yellowBg, border: `1px solid ${T.yellow}40`, borderRadius: 6, padding: "8px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span style={{ fontSize: 11, color: T.text }}>Viewing <strong>Banggai MPA</strong> as Super Admin (read-only). Mutation buttons are disabled.</span>
          <Btn primary small onClick={() => setShowModal(true)}>Enable Impersonation Mode</Btn>
        </div>
      )}

      {mode === "active" && (
        <div style={{ background: T.redBg, border: `1px solid ${T.red}80`, borderRadius: 6, padding: "8px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.red, boxShadow: `0 0 6px ${T.red}` }} />
          <span style={{ fontSize: 11, color: T.text }}>🔴 <strong style={{ color: T.red }}>IMPERSONATION ACTIVE</strong> — Banggai MPA — All actions audited with dual user IDs. Auto-expires in <strong>27 min</strong>.</span>
          <Btn danger small onClick={() => setMode("readonly")}>Disable</Btn>
        </div>
      )}

      <PT>{mode === "active" ? "Banggai Dashboard (you can edit)" : "Banggai Dashboard (read-only)"}</PT>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {[{ l: "Active Events", v: "22" }, { l: "Active Patrols", v: "6" }, { l: "Rangers On Duty", v: "14" }, { l: "Events This Month", v: "47" }].map((k, i) => (
          <Card key={i} style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.text }}>{k.v}</div>
          </Card>
        ))}
      </div>

      <Card>
        <ST>Sample Actions (state-aware)</ST>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {["Acknowledge Alert", "Edit Event #14063", "Resolve Event", "Delete User", "Update Config"].map((a, i) => (
            <button key={i} disabled={mode === "readonly"} style={{ padding: "7px 14px", borderRadius: 16, background: mode === "active" ? T.blue : T.elevated, color: mode === "active" ? "#fff" : T.textMuted, border: "none", fontSize: 11, fontWeight: 600, cursor: mode === "active" ? "pointer" : "not-allowed", opacity: mode === "readonly" ? 0.6 : 1 }} title={mode === "readonly" ? "Impersonation Mode disabled — click banner to enable" : ""}>
              {a}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: "8px 10px", background: T.bg, borderRadius: 6, fontSize: 10, color: T.textMuted, lineHeight: 1.6 }}>
          <strong style={{ color: T.text }}>Audit trail (live):</strong> every mutation while impersonating writes an AuditLog row with both <code>acting_user_id</code> (Super Admin) and <code>impersonated_as_tenant_id</code>. Toggle ON/OFF events are written at high severity.
        </div>
      </Card>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <Card style={{ width: 420, padding: 24 }}>
            <ST>⚠ Enable Impersonation Mode?</ST>
            <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
              You are about to make changes inside <strong style={{ color: T.text }}>Banggai MPA</strong>. All actions will be logged with your Super Admin user ID and a high-severity audit flag. Type the tenant slug <code style={{ background: T.bg, padding: "1px 5px", borderRadius: 3, color: T.cyan }}>banggai</code> below to confirm.
            </div>
            <Input label="Type 'banggai' to confirm" placeholder="banggai" />
            <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "flex-end" }}>
              <Btn onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn danger onClick={() => { setMode("active"); setShowModal(false); }}>Enable Impersonation</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// ──── EXPORTS QUEUE ★★ ────
const ExportsQueue = () => (
  <div><Mb s="Mobile Ready" />
    <PT right={<Btn small>Clear Old Files</Btn>}>My Report Exports</PT>

    <Card style={{ marginBottom: 12, borderLeft: `3px solid ${T.cyan}`, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>📄</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>PDF Renders Run Async</span>
      </div>
      <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.6 }}>
        Every PDF export is queued and rendered by the <code style={{ background: T.bg, padding: "1px 5px", borderRadius: 3, color: T.cyan }}>marine-guardian-pdf-renderer</code> Docker service (headless Chromium via Puppeteer). You'll get an in-app notification when each one is ready. Files retained 30 days. Typical render time: 3–8s for small reports, 20–30s for annual coverage.
      </div>
    </Card>

    <Card style={{ padding: 0, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><TR h><TD h>Report</TD><TD h>Params</TD><TD h>Paper</TD><TD h>Status</TD><TD h>Size</TD><TD h>Requested</TD><TD h>Actions</TD></TR></thead>
        <tbody>
          {[
            { t: "Patrol Coverage (Template)", p: "May 2026 · Monthly", pa: "A4", s: "ready", sz: "1.2 MB", req: "2m ago" },
            { t: "Ranger Performance", p: "Dec 2025", pa: "A4", s: "ready", sz: "640 KB", req: "8m ago" },
            { t: "Patrol Coverage (Template)", p: "2026 · Annual", pa: "A4", s: "rendering", sz: "—", req: "15s ago" },
            { t: "Per Area Report", p: "Area 12a · May 2026", pa: "Letter", s: "queued", sz: "—", req: "8s ago" },
            { t: "Detailed Event Log", p: "Apr 2026", pa: "A4", s: "ready", sz: "2.1 MB", req: "1d ago" },
            { t: "Consolidated Report", p: "Q1 2026", pa: "Legal", s: "failed", sz: "—", req: "2d ago" },
          ].map((e, i) => (
            <TR key={i}>
              <TD><strong>{e.t}</strong></TD>
              <TD>{e.p}</TD>
              <TD>{e.pa}</TD>
              <TD>
                {e.s === "ready" && <Badge color="green">✓ Ready</Badge>}
                {e.s === "rendering" && <Badge color="blue">⟳ Rendering</Badge>}
                {e.s === "queued" && <Badge color="muted">⋯ Queued</Badge>}
                {e.s === "failed" && <Badge color="red">✗ Failed</Badge>}
              </TD>
              <TD>{e.sz}</TD>
              <TD>{e.req}</TD>
              <TD>
                {e.s === "ready" && <Btn small primary>⬇ Download</Btn>}
                {e.s === "failed" && <Btn small>Retry</Btn>}
                {(e.s === "queued" || e.s === "rendering") && <span style={{ fontSize: 10, color: T.textMuted }}>—</span>}
              </TD>
            </TR>
          ))}
        </tbody>
      </table>
    </Card>

    <Card style={{ marginTop: 12, padding: 14 }}>
      <ST>Queue Stats (this tenant)</ST>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
        <Stat label="Ready" value="247" />
        <Stat label="Rendering" value="1" />
        <Stat label="Queued" value="1" />
        <Stat label="Failed (30d)" value="3" />
      </div>
    </Card>
  </div>
);

// ──── AUDIT LOG — Round 4: /[tenant]/audit (Site Admin+) ★★ ────
const AuditLog = () => {
  const [filter, setFilter] = useState("All");
  const entries = [
    { ts: "Jan 12, 14:47:12", actor: "ahmad@banggai.org", action: "event.state_change", entity: "Event #14063", sev: "info", det: "state: new → active" },
    { ts: "Jan 12, 14:33:02", actor: "siti@banggai.org", action: "event.detail_update", entity: "Event #14063", sev: "info", det: "action_taken: \"\" → \"Reported to BAPL Banggai PSDKP\"" },
    { ts: "Jan 12, 14:15:50", actor: "siti@banggai.org", action: "accompanying_ranger.add", entity: "Event #14063", sev: "info", det: "added 3 companions: Putra Larekeng, Imran Idris, Abdul" },
    { ts: "Jan 12, 13:02:18", actor: "superadmin@powerbyte.app", action: "impersonation.enable", entity: "Tenant: Banggai MPA", sev: "high", det: "Read-only impersonation by superadmin (acting_user_id=usr_sa_01)" },
    { ts: "Jan 12, 12:35:00", actor: "ahmad@banggai.org", action: "tenant.config_update", entity: "Tenant: Banggai MPA", sev: "high", det: "sync_state: running → manual_pause; reason: \"Scheduled ER maintenance window\"" },
    { ts: "Jan 12, 11:08:47", actor: "ahmad@banggai.org", action: "alert_rule.create", entity: "AlertRule: \"Critical events — any\"", sev: "info", det: "kind=event_match, priority_min=critical, channels=[in_app,email]" },
    { ts: "Jan 12, 09:44:21", actor: "ahmad@banggai.org", action: "area_boundary.edit", entity: "AreaBoundary: Solan Bajo Reef", sev: "info", det: "polygon: 7 vertices → 11 vertices (refined from operator survey)" },
    { ts: "Jan 12, 09:22:55", actor: "system", action: "sync.auth_failure_reset", entity: "Tenant: Banggai MPA", sev: "warning", det: "auth_failure_count: 1 → 0 (recovered after credential update)" },
    { ts: "Jan 12, 09:21:08", actor: "ahmad@banggai.org", action: "tenant.credential_update", entity: "Tenant: Banggai MPA", sev: "critical", det: "earthranger_das_token rotated (old value redacted from audit)" },
    { ts: "Jan 12, 09:18:33", actor: "system", action: "sync.circuit_breaker_trip", entity: "Tenant: Banggai MPA", sev: "critical", det: "auth_failure_count reached 2; sync_state → auth_failed; notification dispatched to 2 Site Admins" },
    { ts: "Jan 11, 18:02:14", actor: "budi@banggai.org", action: "user.role_change", entity: "User: nelson@banggai.org", sev: "high", det: "role: operator → field_coordinator" },
    { ts: "Jan 11, 16:45:22", actor: "siti@banggai.org", action: "fuel_entry.create", entity: "FuelEntry: A12a · 500L", sev: "info", det: "Rp 2,600,000 · receipt photo attached" },
    { ts: "Jan 11, 14:30:08", actor: "siti@banggai.org", action: "event.state_change", entity: "Event #13967", sev: "info", det: "state: active → resolved" },
    { ts: "Jan 10, 21:18:44", actor: "ahmad@banggai.org", action: "alert_rule.toggle", entity: "AlertRule: \"Stale GPS\"", sev: "info", det: "is_active: true → false" },
    { ts: "Jan 10, 11:02:31", actor: "superadmin@powerbyte.app", action: "tenant.create", entity: "Tenant: Pecca MPA", sev: "critical", det: "slug=pecca, timezone=Asia/Manila, currency=PHP" },
  ];
  const filtered = filter === "All" ? entries : entries.filter(e => e.sev === filter.toLowerCase());
  const sevColor = s => s === "critical" ? "red" : s === "high" ? "orange" : s === "warning" ? "yellow" : "muted";
  return (
    <div><Mb s="Mobile Ready" /><PT right={<div style={{ display: "flex", gap: 5 }}><Sel><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option></Sel><Btn primary small>Export CSV</Btn></div>}>Audit Log — Banggai MPA</PT>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["All", "Info", "Warning", "High", "Critical"].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: "4px 12px", borderRadius: 16, border: `1px solid ${filter === s ? T.blue : T.border}`, background: filter === s ? T.blueLight : "transparent", color: filter === s ? T.blue : T.textSecondary, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>{s}{s !== "All" && ` (${entries.filter(e => e.sev === s.toLowerCase()).length})`}</button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><TR h><TD h>Timestamp</TD><TD h>Severity</TD><TD h>Actor</TD><TD h>Action</TD><TD h>Entity</TD><TD h>Details</TD></TR></thead>
          <tbody>
            {filtered.map((e, i) => (
              <TR key={i}>
                <TD><span style={{ fontFamily: "monospace", fontSize: 10, color: T.textSecondary }}>{e.ts}</span></TD>
                <TD><Badge color={sevColor(e.sev)}>{e.sev}</Badge></TD>
                <TD><span style={{ color: e.actor === "system" ? T.cyan : T.blue, fontSize: 10 }}>{e.actor}</span></TD>
                <TD><code style={{ fontSize: 10, color: T.text }}>{e.action}</code></TD>
                <TD><span style={{ fontSize: 10, color: T.text }}>{e.entity}</span></TD>
                <TD><span style={{ fontSize: 10, color: T.textSecondary, whiteSpace: "normal" }}>{e.det}</span></TD>
              </TR>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Card style={{ flex: 1, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>RETENTION</div>
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}>AuditLog rows kept <strong style={{ color: T.cyan }}>indefinitely</strong>. PII (IP addresses, user-agents) retained per § Data Sensitivity.</div>
        </Card>
        <Card style={{ flex: 1, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>IMPERSONATION</div>
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}>Super Admin actions during impersonation have both <code style={{ fontSize: 10, color: T.cyan }}>user_id</code> + <code style={{ fontSize: 10, color: T.cyan }}>acting_user_id</code> set. Filter by Critical severity to find them.</div>
        </Card>
        <Card style={{ flex: 1, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>ACCESS</div>
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}>Permission: <code style={{ fontSize: 10, color: T.cyan }}>audit.view</code>. Site Admin+ within tenant; Super Admin sees cross-tenant.</div>
        </Card>
      </div>
    </div>
  );
};


// ──── MAIN APP ────
const allScreens = [
  { id: "login", label: "Login" }, { id: "warroom", label: "⬤ Command Center" },
  { id: "dashboard", label: "Dashboard" }, { id: "map", label: "Live Map" },
  { id: "events", label: "Events (Kanban)" }, { id: "event-detail", label: "Event Detail ★" },
  { id: "patrol-monitor", label: "Patrol Monitor ★" }, { id: "patrol-areas", label: "Patrol Areas" },
  { id: "area-boundaries", label: "🗺️ Area Boundaries ★★" },
  { id: "patrol-schedule", label: "Patrol Schedule" }, { id: "fuel", label: "⛽ Fuel Logging ★" },
  { id: "report-area", label: "Per Area Report" },
  { id: "report-coverage", label: "📄 Coverage Report ★★" },
  { id: "report-consolidated", label: "Consolidated" }, { id: "report-detailed", label: "Detailed Log ★" },
  { id: "report-rangers", label: "Rangers Perf ★" }, { id: "ranger-detail", label: "Ranger Detail ★" },
  { id: "exports", label: "📦 Exports Queue ★★" },
  { id: "alerts", label: "Alert Rules" },
  { id: "alert-rule-form", label: "Alert Rule Form ★★" },
  { id: "notifications", label: "Notifications" },
  { id: "audit", label: "📋 Audit Log ★★★" },
  { id: "users", label: "User Mgmt" }, { id: "settings", label: "Tenant Settings ★★★" },
  { id: "sync-health", label: "⟳ Sync Health ★★★" },
  { id: "admin-tenants", label: "Super Admin" },
  { id: "admin-impersonate", label: "🔒 Impersonation ★★" },
];
const navGroups = [
  { label: "COMMAND", items: ["warroom", "dashboard", "map"] },
  { label: "OPERATIONS", items: ["events", "event-detail", "notifications"] },
  { label: "PATROLS", items: ["patrol-monitor", "patrol-areas", "area-boundaries", "patrol-schedule"] },
  { label: "LOGISTICS", items: ["fuel"] },
  { label: "REPORTS", items: ["report-area", "report-coverage", "report-consolidated", "report-detailed", "report-rangers", "ranger-detail", "exports"] },
  { label: "ADMIN", items: ["alerts", "alert-rule-form", "users", "settings", "sync-health", "audit", "admin-tenants", "admin-impersonate"] },
];
const R = { login: LoginScreen, warroom: WarRoom, dashboard: Dashboard, map: LiveMap, events: EventKanban, "event-detail": EventDetail, "patrol-monitor": PatrolMonitor, "patrol-areas": PatrolAreas, "area-boundaries": AreaBoundaries, "patrol-schedule": PatrolSchedule, fuel: FuelLogging, "report-area": ReportArea, "report-coverage": CoverageReport, "report-consolidated": ReportConsolidated, "report-detailed": ReportDetailed, "report-rangers": ReportRangers, "ranger-detail": RangerDetail, exports: ExportsQueue, alerts: AlertRules, "alert-rule-form": AlertRuleForm, notifications: Notifications, audit: AuditLog, users: UserMgmt, settings: TenantSettings, "sync-health": SyncHealth, "admin-tenants": SuperAdmin, "admin-impersonate": SuperAdminImpersonation };

export default function App() {
  const [screen, setScreen] = useState("sync-health");
  const [nav, setNav] = useState(true);
  const Screen = R[screen] || WarRoom;
  return (
    <div style={{ fontFamily: T.font, background: T.bg, color: T.text, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#F7D154", color: "#18191A", padding: "4px 20px", fontSize: 9, fontWeight: 600, textAlign: "center" }}>📐 PHASE 2.8 v6 — 27 SCREENS · ★★★ ROUND 4: Sync Health 4-state · Tenant Settings Path A/B + Verify Limits · Audit Log · Event Detail dual-storage</div>
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "0 12px", height: 42, display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setNav(!nav)} style={{ background: "none", border: "none", color: T.textSecondary, fontSize: 14, cursor: "pointer" }}>☰</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>🌊 Marine Guardian</span>
        <span style={{ fontSize: 9, color: T.textMuted }}>/ Banggai</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {["🇬🇧", "🇮🇩", "🇲🇾"].map((f, i) => <button key={i} style={{ padding: "1px 3px", borderRadius: 3, border: `1px solid ${i === 0 ? T.blue : "transparent"}`, background: i === 0 ? T.blueLight : "transparent", fontSize: 10, cursor: "pointer" }}>{f}</button>)}
          <button onClick={() => setScreen("warroom")} style={{ padding: "2px 8px", borderRadius: 12, background: screen === "warroom" ? T.red : T.elevated, color: screen === "warroom" ? "#fff" : T.textSecondary, border: "none", fontSize: 8, fontWeight: 600, cursor: "pointer" }}>{screen === "warroom" ? "🔴 LIVE" : "WAR ROOM"}</button>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "#fff" }}>OP</div>
        </div>
      </div>
      <div style={{ display: "flex", flex: 1 }}>
        {nav && <div style={{ width: 170, background: T.surface, borderRight: `1px solid ${T.border}`, padding: "4px 0", overflowY: "auto", flexShrink: 0 }}>
          <button onClick={() => setScreen("login")} style={{ display: "block", width: "100%", padding: "4px 10px", background: screen === "login" ? T.blueLight : "transparent", border: "none", color: screen === "login" ? T.blue : T.textMuted, fontSize: 9, textAlign: "left", cursor: "pointer" }}>← Login</button>
          {navGroups.map((g, gi) => <div key={gi} style={{ marginTop: 6 }}><div style={{ padding: "2px 10px", fontSize: 7, fontWeight: 700, color: T.textMuted, letterSpacing: 1 }}>{g.label}</div>{g.items.map(id => { const s = allScreens.find(x => x.id === id); return s ? <button key={id} onClick={() => setScreen(id)} style={{ display: "block", width: "100%", padding: "3px 10px", background: screen === id ? T.blueLight : "transparent", border: "none", color: screen === id ? T.blue : T.textSecondary, fontSize: 9, textAlign: "left", cursor: "pointer", fontWeight: screen === id ? 600 : 400 }}>{s.label}</button> : null; })}</div>)}
        </div>}
        <div style={{ flex: 1, padding: screen === "warroom" ? 8 : 16, overflowY: "auto", display: "flex", flexDirection: "column" }}><Screen /></div>
      </div>
    </div>
  );
}
