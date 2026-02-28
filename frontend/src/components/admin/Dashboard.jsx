import { useState, useEffect } from "react";
import axios from "axios";
import { Users, Shield, Target, AlertTriangle, Activity, Globe, Bot } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const StatCard = ({ label, value, sub, color = "#00ff88", icon: Icon }) => (
  <div data-testid={`stat-${label.toLowerCase().replace(/\s+/g,'-')}`} style={{
    background: "#080808", border: "1px solid #111",
    padding: "1.25rem", position: "relative", overflow: "hidden"
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ color: "#444", fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          {label}
        </div>
        <div style={{ color, fontSize: "2rem", fontWeight: 700, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ color: "#333", fontSize: "0.65rem", marginTop: "0.4rem" }}>{sub}</div>}
      </div>
      {Icon && <Icon size={20} color={color} style={{ opacity: 0.3 }} />}
    </div>
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: color, opacity: 0.15 }} />
  </div>
);

export default function Dashboard({ stats, liveEvents, onTabChange }) {
  const [recentVisitors, setRecentVisitors] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [vRes, aRes] = await Promise.all([
          axios.get(`${API}/visitors`),
          axios.get(`${API}/alerts`),
        ]);
        setRecentVisitors(vRes.data.slice(0, 6));
        setRecentAlerts(aRes.data.slice(0, 5));
      } catch (_) {}
    };
    load();
  }, []);

  // Refresh visitors on live events
  useEffect(() => {
    if (!liveEvents?.length) return;
    const latest = liveEvents[0];
    if (["new_visitor", "visitor_updated"].includes(latest?.event)) {
      axios.get(`${API}/visitors`).then(r => setRecentVisitors(r.data.slice(0, 6))).catch(() => {});
    }
    if (latest?.event === "new_alert") {
      setRecentAlerts(prev => [latest.alert, ...prev].slice(0, 5));
    }
  }, [liveEvents]);

  const v = stats?.visitors || {};
  const p = stats?.pentest || {};

  const severityColor = (s) => ({ critical: "#ff4444", warning: "#ffaa00", info: "#00ff88" }[s] || "#555");

  return (
    <div data-testid="dashboard" className="slide-up">
      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <StatCard label="Total Visitors" value={v.total || 0} sub={`${v.online || 0} online now`} icon={Users} />
        <StatCard label="Pending" value={v.pending || 0} sub="awaiting approval" color="#ffaa00" icon={Activity} />
        <StatCard label="Blocked" value={v.blocked || 0} sub={`${v.bots || 0} bots detected`} color="#ff4444" icon={Shield} />
        <StatCard label="Targets" value={p.targets || 0} sub={`${p.active_targets || 0} active`} color="#00aaff" icon={Target} />
        <StatCard label="Vulns" value={p.vulnerabilities || 0} sub={`${p.critical || 0} critical`} color="#ff4444" icon={AlertTriangle} />
        <StatCard label="Alerts" value={stats?.alerts?.unread || 0} sub="unread" color="#ffaa00" icon={AlertTriangle} />
      </div>

      {/* Two columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Recent visitors */}
        <div style={{ background: "#080808", border: "1px solid #111", padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #111" }}>
            <div style={{ color: "#fff", fontSize: "0.7rem", letterSpacing: "0.2em" }}>RECENT VISITORS</div>
            <button onClick={() => onTabChange("visitors")} style={{ background: "none", border: "none", color: "#00ff8866", fontSize: "0.6rem", cursor: "pointer", letterSpacing: "0.1em" }}>
              VIEW ALL →
            </button>
          </div>
          {recentVisitors.length === 0 ? (
            <div style={{ color: "#222", fontSize: "0.7rem", textAlign: "center", padding: "1.5rem" }}>No visitors yet</div>
          ) : recentVisitors.map(v => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem 0", borderBottom: "1px solid #0a0a0a" }}>
              <div style={{
                width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
                background: v.status === "approved" ? "#00ff88" : v.status === "blocked" ? "#ff4444" : "#ffaa00"
              }} />
              <Globe size={11} color="#333" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#ccc", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.ip}
                  {v.is_bot && <span style={{ color: "#ff6600", fontSize: "0.6rem", marginLeft: "0.3rem" }}>[BOT]</span>}
                </div>
                <div style={{ color: "#444", fontSize: "0.6rem" }}>{v.city}, {v.country}</div>
              </div>
              <div style={{ color: "#333", fontSize: "0.6rem" }}>{v.status?.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Live event feed */}
        <div style={{ background: "#080808", border: "1px solid #111", padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #111" }}>
            <div style={{ color: "#fff", fontSize: "0.7rem", letterSpacing: "0.2em" }}>LIVE EVENTS</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00ff88", animation: "pulse-green 2s infinite" }} />
              <span style={{ color: "#00ff88", fontSize: "0.6rem" }}>LIVE</span>
            </div>
          </div>
          {liveEvents.length === 0 ? (
            <div style={{ color: "#222", fontSize: "0.7rem", textAlign: "center", padding: "1.5rem" }}>Waiting for events...</div>
          ) : liveEvents.slice(0, 8).map((ev, i) => (
            <div key={i} style={{ fontSize: "0.65rem", color: "#444", marginBottom: "0.4rem", padding: "0.3rem", background: i === 0 ? "#0a1a0a" : "transparent" }}>
              <span style={{ color: "#00ff8866" }}>&gt;</span>{" "}
              <span style={{ color: i === 0 ? "#00ff88" : "#444" }}>
                {ev.event?.replace(/_/g, " ").toUpperCase()}
              </span>
              {ev.visitor?.ip && <span style={{ color: "#333" }}> — {ev.visitor.ip}</span>}
            </div>
          ))}
        </div>

        {/* Bot detection stats */}
        <div style={{ background: "#080808", border: "1px solid #111", padding: "1rem" }}>
          <div style={{ color: "#fff", fontSize: "0.7rem", letterSpacing: "0.2em", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #111" }}>
            BOT DETECTION
          </div>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            {[
              { label: "HUMANS", val: Math.max(0, (v.total || 0) - (v.bots || 0)), color: "#00ff88" },
              { label: "BOTS", val: v.bots || 0, color: "#ff6600" },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <div style={{ color, fontSize: "1.6rem", fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#333", fontSize: "0.6rem", letterSpacing: "0.15em" }}>{label}</div>
              </div>
            ))}
            <Bot size={32} color="#ff660022" style={{ marginLeft: "auto" }} />
          </div>
          {v.total > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ background: "#111", height: "4px" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.round(((v.total - v.bots) / v.total) * 100)}%`,
                  background: "#00ff88"
                }} />
              </div>
              <div style={{ color: "#333", fontSize: "0.6rem", marginTop: "0.3rem" }}>
                {Math.round(((v.total - (v.bots || 0)) / v.total) * 100)}% human traffic
              </div>
            </div>
          )}
        </div>

        {/* Recent alerts */}
        <div style={{ background: "#080808", border: "1px solid #111", padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #111" }}>
            <div style={{ color: "#fff", fontSize: "0.7rem", letterSpacing: "0.2em" }}>RECENT ALERTS</div>
            <button onClick={() => onTabChange("alerts")} style={{ background: "none", border: "none", color: "#00ff8866", fontSize: "0.6rem", cursor: "pointer", letterSpacing: "0.1em" }}>
              VIEW ALL →
            </button>
          </div>
          {recentAlerts.length === 0 ? (
            <div style={{ color: "#222", fontSize: "0.7rem", textAlign: "center", padding: "1.5rem" }}>No alerts</div>
          ) : recentAlerts.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.4rem 0", borderBottom: "1px solid #0a0a0a" }}>
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: severityColor(a.severity), marginTop: "0.35rem", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: a.read ? "#444" : "#ccc", fontSize: "0.68rem" }}>{a.message}</div>
                <div style={{ color: "#333", fontSize: "0.58rem", marginTop: "0.2rem" }}>{a.created_at?.slice(0, 16).replace("T", " ")}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
