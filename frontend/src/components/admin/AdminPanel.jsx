import { useState, useEffect, useRef } from "react";
import axios from "axios";
import Dashboard from "./Dashboard";
import VisitorManager from "./VisitorManager";
import PageManager from "./PageManager";
import PentestPanel from "./PentestPanel";
import AlertsPanel from "./AlertsPanel";
import { Shield, Monitor, FileCode, Target, Bell, LogOut, Wifi, WifiOff } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";
const WS_BASE = process.env.REACT_APP_BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://");

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Monitor },
  { id: "visitors", label: "Visitors", icon: Shield },
  { id: "pages", label: "Pages", icon: FileCode },
  { id: "pentest", label: "Pentest", icon: Target },
  { id: "alerts", label: "Alerts", icon: Bell },
];

export default function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);
  const wsRef = useRef(null);
  const pingRef = useRef(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/auth/admin`, { password });
      setAuthed(true);
      setAuthError("");
    } catch {
      setAuthError("Invalid password. Access denied.");
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/stats`);
      setStats(res.data);
    } catch (_) {}
  };

  // WebSocket for real-time admin updates
  useEffect(() => {
    if (!authed) return;
    fetchStats();

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/api/ws/admin`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        pingRef.current = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 20000);
      };

      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        try {
          const data = JSON.parse(e.data);
          setLiveEvents(prev => [data, ...prev].slice(0, 50));
          // Refresh stats on certain events
          if (["new_visitor", "visitor_updated", "visitor_deleted", "new_alert"].includes(data.event)) {
            fetchStats();
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        clearInterval(pingRef.current);
        setTimeout(connect, 3000);
      };
    };
    connect();
    const statsInterval = setInterval(fetchStats, 15000);
    return () => {
      wsRef.current?.close();
      clearInterval(pingRef.current);
      clearInterval(statsInterval);
    };
  }, [authed]); // eslint-disable-line

  // ─── Login Screen ───────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div data-testid="admin-login" style={{
        background: "#000", minHeight: "100vh", display: "flex", justifyContent: "center",
        alignItems: "center", fontFamily: "'JetBrains Mono', monospace"
      }} className="scanline">
        <div style={{ width: "360px", padding: "2.5rem", border: "1px solid #1a1a1a", background: "#050505" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ color: "#00ff88", fontSize: "1.1rem", letterSpacing: "0.3em", fontWeight: 700, textTransform: "uppercase" }}>
              ADMIN ACCESS
            </div>
            <div style={{ color: "#333", fontSize: "0.7rem", marginTop: "0.3rem", letterSpacing: "0.15em" }}>
              PENTEST CONTROL PANEL v2.1
            </div>
          </div>
          <form onSubmit={handleLogin} data-testid="login-form">
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ color: "#555", fontSize: "0.65rem", letterSpacing: "0.2em", display: "block", marginBottom: "0.4rem" }}>
                ACCESS CODE
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                data-testid="password-input"
                placeholder="Enter access code..."
                style={{
                  width: "100%", background: "#0a0a0a", border: "1px solid #222",
                  color: "#00ff88", padding: "0.6rem 0.8rem", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.85rem", outline: "none", letterSpacing: "0.1em",
                  borderColor: password ? "#00ff8844" : "#222"
                }}
              />
            </div>
            {authError && (
              <div data-testid="auth-error" style={{ color: "#ff4444", fontSize: "0.7rem", marginBottom: "0.8rem", letterSpacing: "0.1em" }}>
                ✗ {authError}
              </div>
            )}
            <button
              type="submit"
              data-testid="login-submit"
              style={{
                width: "100%", background: "#00ff88", color: "#000", border: "none",
                padding: "0.65rem", fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.2em",
                textTransform: "uppercase", cursor: "pointer"
              }}
            >
              AUTHENTICATE
            </button>
          </form>
          <div style={{ marginTop: "1.5rem", color: "#1a1a1a", fontSize: "0.6rem", textAlign: "center", letterSpacing: "0.1em" }}>
            UNAUTHORIZED ACCESS IS PROHIBITED AND MONITORED
          </div>
        </div>
      </div>
    );
  }

  // ─── Admin Panel ────────────────────────────────────────────────────────────
  return (
    <div data-testid="admin-panel" style={{ display: "flex", minHeight: "100vh", background: "#0a0a0a", fontFamily: "'JetBrains Mono', monospace" }} className="scanline">
      {/* Sidebar */}
      <aside style={{
        width: "220px", minWidth: "220px", background: "#050505",
        borderRight: "1px solid #111", display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh", overflow: "hidden"
      }}>
        {/* Logo */}
        <div style={{ padding: "1.25rem 1rem", borderBottom: "1px solid #111" }}>
          <div style={{ color: "#00ff88", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.2em" }}>
            ADMIN PANEL
          </div>
          <div style={{ color: "#333", fontSize: "0.6rem", letterSpacing: "0.15em", marginTop: "0.2rem" }}>
            PENTEST CONTROL v2.1
          </div>
        </div>

        {/* Live status */}
        <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid #0a0a0a", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {wsConnected
            ? <Wifi size={10} color="#00ff88" />
            : <WifiOff size={10} color="#ff4444" />}
          <span style={{ fontSize: "0.6rem", color: wsConnected ? "#00ff88" : "#ff4444", letterSpacing: "0.15em" }}>
            {wsConnected ? "LIVE" : "RECONNECTING"}
          </span>
          {stats && (
            <span style={{ marginLeft: "auto", fontSize: "0.6rem", color: "#555" }}>
              {stats.visitors?.online || 0} online
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "0.5rem 0" }}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const isActive = tab === id;
            const badge = id === "visitors" ? stats?.visitors?.pending
              : id === "alerts" ? stats?.alerts?.unread : 0;
            return (
              <button
                key={id}
                data-testid={`nav-${id}`}
                onClick={() => setTab(id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.65rem 1rem", background: isActive ? "#0a1a0a" : "transparent",
                  border: "none", borderLeft: isActive ? "2px solid #00ff88" : "2px solid transparent",
                  color: isActive ? "#00ff88" : "#444", cursor: "pointer",
                  fontSize: "0.72rem", letterSpacing: "0.15em", textTransform: "uppercase",
                  textAlign: "left", transition: "color 0.2s, background 0.2s"
                }}
              >
                <Icon size={14} />
                {label}
                {badge > 0 && (
                  <span style={{
                    marginLeft: "auto", background: "#ff4444", color: "#fff",
                    fontSize: "0.55rem", padding: "1px 5px", borderRadius: "2px",
                    fontWeight: 700
                  }}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <button
          data-testid="logout-btn"
          onClick={() => { setAuthed(false); setPassword(""); }}
          style={{
            display: "flex", alignItems: "center", gap: "0.6rem",
            padding: "0.8rem 1rem", background: "transparent", border: "none",
            borderTop: "1px solid #111", color: "#333", cursor: "pointer",
            fontSize: "0.65rem", letterSpacing: "0.15em", width: "100%",
            transition: "color 0.2s"
          }}
        >
          <LogOut size={13} />
          SIGN OUT
        </button>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", padding: "1.5rem" }}>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid #111" }}>
          <div>
            <div style={{ color: "#fff", fontSize: "1rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>
              {NAV.find(n => n.id === tab)?.label}
            </div>
            <div style={{ color: "#333", fontSize: "0.6rem", marginTop: "0.2rem" }}>
              {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            {stats && [
              { label: "ONLINE", val: stats.visitors?.online || 0, color: "#00ff88" },
              { label: "PENDING", val: stats.visitors?.pending || 0, color: "#ffaa00" },
              { label: "VULNS", val: stats.pentest?.vulnerabilities || 0, color: "#ff4444" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ color, fontSize: "1.1rem", fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#333", fontSize: "0.55rem", letterSpacing: "0.15em" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {tab === "dashboard" && <Dashboard stats={stats} liveEvents={liveEvents} onTabChange={setTab} />}
        {tab === "visitors" && <VisitorManager liveEvents={liveEvents} />}
        {tab === "pages" && <PageManager />}
        {tab === "pentest" && <PentestPanel />}
        {tab === "alerts" && <AlertsPanel />}
      </main>
    </div>
  );
}
