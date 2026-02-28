import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Bell, CheckCheck, Trash2, RefreshCw, Send } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const severityColor = (s) => ({
  critical: "#ff4444", warning: "#ffaa00", info: "#00ff88"
}[s] || "#555");

const typeIcon = (t) => ({
  visitor: "◎", pentest: "⚑", system: "⬡", security: "⚠"
}[t] || "·");

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [telegramTest, setTelegramTest] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/alerts`);
      setAlerts(res.data);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    try {
      await axios.put(`${API}/alerts/${id}/read`);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
    } catch (_) {}
  };

  const markAllRead = async () => {
    try {
      await axios.put(`${API}/alerts/read-all`);
      setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    } catch (_) {}
  };

  const deleteAlert = async (id) => {
    try {
      await axios.delete(`${API}/alerts/${id}`);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (_) {}
  };

  const testTelegram = async () => {
    try {
      await axios.get(`${API}/telegram/test`);
      setTelegramTest("Notification sent! Check your Telegram bot.");
    } catch (_) {
      setTelegramTest("Failed. Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backend/.env");
    }
    setTimeout(() => setTelegramTest(""), 5000);
  };

  const filtered = alerts.filter(a => {
    if (filter === "all") return true;
    if (filter === "unread") return !a.read;
    return a.type === filter || a.severity === filter;
  });

  const unread = alerts.filter(a => !a.read).length;

  return (
    <div data-testid="alerts-panel" className="slide-up">
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {["all", "unread", "visitor", "pentest", "system", "critical", "warning"].map(f => (
            <button
              key={f}
              data-testid={`alert-filter-${f}`}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "#00ff88" : "transparent",
                color: filter === f ? "#000" : "#444",
                border: `1px solid ${filter === f ? "#00ff88" : "#222"}`,
                padding: "0.25rem 0.5rem", fontSize: "0.58rem",
                cursor: "pointer", letterSpacing: "0.12em", textTransform: "uppercase",
                fontFamily: "'JetBrains Mono', monospace"
              }}
            >
              {f}{f === "unread" && unread > 0 ? ` (${unread})` : ""}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button onClick={markAllRead} data-testid="mark-all-read" style={{
            background: "transparent", border: "1px solid #222", color: "#555",
            padding: "0.3rem 0.6rem", fontSize: "0.6rem", cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: "0.3rem"
          }}>
            <CheckCheck size={11} /> MARK ALL READ
          </button>
          <button onClick={load} data-testid="refresh-alerts" style={{
            background: "transparent", border: "1px solid #222", color: "#555",
            padding: "0.3rem 0.5rem", fontSize: "0.6rem", cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace"
          }}>
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Telegram test */}
      <div style={{ background: "#080808", border: "1px solid #111", padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <Bell size={13} color="#00ff8866" />
        <div style={{ flex: 1 }}>
          <div style={{ color: "#555", fontSize: "0.65rem", letterSpacing: "0.1em" }}>TELEGRAM NOTIFICATIONS</div>
          {telegramTest && <div style={{ color: telegramTest.includes("sent") ? "#00ff88" : "#ff4444", fontSize: "0.65rem", marginTop: "0.2rem" }}>{telegramTest}</div>}
        </div>
        <button onClick={testTelegram} data-testid="test-telegram-btn" style={{
          background: "transparent", border: "1px solid #00ff8833", color: "#00ff88",
          padding: "0.3rem 0.7rem", fontSize: "0.6rem", cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em",
          display: "flex", alignItems: "center", gap: "0.4rem"
        }}>
          <Send size={10} /> TEST
        </button>
      </div>

      {/* Alert list */}
      {loading ? (
        <div style={{ color: "#333", textAlign: "center", padding: "2rem" }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#222", textAlign: "center", padding: "3rem", border: "1px dashed #111" }}>
          No alerts found
        </div>
      ) : (
        <div style={{ background: "#080808", border: "1px solid #111" }}>
          {filtered.map((a) => (
            <div
              key={a.id}
              data-testid={`alert-row-${a.id}`}
              style={{
                display: "flex", alignItems: "flex-start", gap: "0.75rem",
                padding: "0.7rem 1rem", borderBottom: "1px solid #0a0a0a",
                background: !a.read ? "#0a0a05" : "transparent",
                cursor: !a.read ? "pointer" : "default"
              }}
              onClick={() => !a.read && markRead(a.id)}
            >
              {/* Severity dot */}
              <div style={{ marginTop: "4px" }}>
                <div style={{
                  width: "7px", height: "7px", borderRadius: "50%",
                  background: severityColor(a.severity),
                  boxShadow: !a.read ? `0 0 8px ${severityColor(a.severity)}` : "none"
                }} />
              </div>

              {/* Type icon */}
              <div style={{ color: "#333", fontSize: "0.8rem", marginTop: "1px" }}>
                {typeIcon(a.type)}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{
                  color: a.read ? "#444" : "#ccc",
                  fontSize: "0.75rem",
                  fontWeight: a.read ? 400 : 500
                }}>
                  {a.message}
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.3rem" }}>
                  <span style={{ color: "#333", fontSize: "0.6rem" }}>{a.created_at?.slice(0, 19).replace("T", " ")} UTC</span>
                  <span style={{ color: "#333", fontSize: "0.6rem", letterSpacing: "0.1em" }}>
                    [{a.type?.toUpperCase()}]
                  </span>
                  <span style={{ color: severityColor(a.severity), fontSize: "0.6rem", letterSpacing: "0.1em" }}>
                    {a.severity?.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                {!a.read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); markRead(a.id); }}
                    data-testid={`mark-read-${a.id}`}
                    title="Mark as read"
                    style={{ background: "none", border: "none", color: "#00ff8866", cursor: "pointer" }}
                  >
                    <CheckCheck size={13} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAlert(a.id); }}
                  data-testid={`delete-alert-${a.id}`}
                  title="Delete"
                  style={{ background: "none", border: "none", color: "#ff444433", cursor: "pointer" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: "0.5rem", color: "#333", fontSize: "0.6rem" }}>
        {filtered.length} alert(s) · {unread} unread
      </div>
    </div>
  );
}
