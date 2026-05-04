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
            {[["Municipality", "A12a"], ["Type", "Use of Explosives"], ["Vessel", "NN"], ["Registration", "NN"], ["Address", "Lelang Matamaling"], ["Offender(s)", "Ittang atau Abdul"], ["Action Taken", "— (pending)"], ["Photo", "NO IMAGE"]].map(([k, v], i) => (
              <div key={i} style={{ display: "flex", padding: "7px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ width: 120, fontSize: 10, color: T.textMuted }}>{k}</div><div style={{ fontSize: 11, color: T.text }}>{v}</div></div>
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

const TenantSettings = () => (<div><Mb s="Mobile Ready" /><PT>Tenant Settings — Banggai MPA</PT><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Card><ST>EarthRanger Connection</ST><Input label="Server URL" value="https://banggai.pamdas.org" /><Input label="Username" value="service_account_banggai" /><Input label="Password" value="••••••••" type="password" /><Input label="DAS Web Token (REST API)" value="••••••••••••••••" type="password" /><Input label="ER Track Token (WebSocket)" value="••••••••••••••••" type="password" /><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "8px 10px", background: T.greenBg, borderRadius: 6 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} /><span style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>Connected — Last sync 5s ago</span></div><div style={{ display: "flex", gap: 6, marginTop: 10 }}><Btn primary>Save</Btn><Btn>Test</Btn></div></Card><Card><ST>Tenant Profile</ST><Input label="MPA Site Name" value="Banggai Marine Protected Area" /><Input label="Slug" value="banggai" /><Input label="Timezone" value="Asia/Makassar (WITA)" /><div style={{ marginBottom: 12 }}><label style={{ fontSize: 10, fontWeight: 500, color: T.textSecondary, display: "block", marginBottom: 4 }}>Currency</label><select style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, boxSizing: "border-box" }}><option value="IDR">IDR — Indonesian Rupiah (Rp)</option><option value="PHP">PHP — Philippine Peso (₱)</option><option value="MYR">MYR — Malaysian Ringgit (RM)</option></select></div><Btn primary>Update</Btn></Card></div></div>);

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

// ──── MAIN APP ────
const allScreens = [
  { id: "login", label: "Login" }, { id: "warroom", label: "⬤ Command Center" },
  { id: "dashboard", label: "Dashboard" }, { id: "map", label: "Live Map" },
  { id: "events", label: "Events (Kanban)" }, { id: "event-detail", label: "Event Detail ★" },
  { id: "patrol-monitor", label: "Patrol Monitor ★" }, { id: "patrol-areas", label: "Patrol Areas" },
  { id: "patrol-schedule", label: "Patrol Schedule" }, { id: "fuel", label: "⛽ Fuel Logging ★" },
  { id: "report-area", label: "Per Area Report" },
  { id: "report-consolidated", label: "Consolidated" }, { id: "report-detailed", label: "Detailed Log ★" },
  { id: "report-rangers", label: "Rangers Perf ★" }, { id: "ranger-detail", label: "Ranger Detail ★" },
  { id: "alerts", label: "Alert Rules" }, { id: "notifications", label: "Notifications" },
  { id: "users", label: "User Mgmt" }, { id: "settings", label: "Tenant Settings" },
  { id: "admin-tenants", label: "Super Admin" },
];
const navGroups = [
  { label: "COMMAND", items: ["warroom", "dashboard", "map"] },
  { label: "OPERATIONS", items: ["events", "event-detail", "notifications"] },
  { label: "PATROLS", items: ["patrol-monitor", "patrol-areas", "patrol-schedule"] },
  { label: "LOGISTICS", items: ["fuel"] },
  { label: "REPORTS", items: ["report-area", "report-consolidated", "report-detailed", "report-rangers", "ranger-detail"] },
  { label: "ADMIN", items: ["alerts", "users", "settings", "admin-tenants"] },
];
const R = { login: LoginScreen, warroom: WarRoom, dashboard: Dashboard, map: LiveMap, events: EventKanban, "event-detail": EventDetail, "patrol-monitor": PatrolMonitor, "patrol-areas": PatrolAreas, "patrol-schedule": PatrolSchedule, fuel: FuelLogging, "report-area": ReportArea, "report-consolidated": ReportConsolidated, "report-detailed": ReportDetailed, "report-rangers": ReportRangers, "ranger-detail": RangerDetail, alerts: AlertRules, notifications: Notifications, users: UserMgmt, settings: TenantSettings, "admin-tenants": SuperAdmin };

export default function App() {
  const [screen, setScreen] = useState("fuel");
  const [nav, setNav] = useState(true);
  const Screen = R[screen] || WarRoom;
  return (
    <div style={{ fontFamily: T.font, background: T.bg, color: T.text, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#F7D154", color: "#18191A", padding: "4px 20px", fontSize: 9, fontWeight: 600, textAlign: "center" }}>📐 PHASE 2.8 v5 — ALL 20 SCREENS + ⛽ FUEL LOGGING + ★ ACCOMPANYING RANGERS + PERFORMANCE ALGORITHM</div>
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
