import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL + "/api";
const WS_BASE = process.env.REACT_APP_BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://");

const LOADING_MESSAGES = [
  "Initializing secure connection...",
  "Verifying SSL certificate chain...",
  "Establishing encrypted tunnel...",
  "Authenticating session token...",
  "Performing integrity check...",
  "Loading security modules...",
  "Scanning for anomalies...",
  "Verifying identity parameters...",
  "Waiting for authorization...",
];

function getSessionId() {
  let sid = localStorage.getItem("vsid");
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem("vsid", sid);
  }
  return sid;
}

export default function VisitorPage() {
  const [status, setStatus] = useState("loading"); // loading, pending, approved, blocked
  const [pageContent, setPageContent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [progress, setProgress] = useState(0);
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const msgIdx = useRef(0);

  const sessionId = useRef(getSessionId()).current;

  // Add a new terminal message
  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev.slice(-8), msg]);
  }, []);

  // Animate loading messages (start from index 1, index 0 shown during register)
  useEffect(() => {
    if (status !== "pending") return;
    msgIdx.current = 1; // skip first msg already shown in register()
    const interval = setInterval(() => {
      if (msgIdx.current < LOADING_MESSAGES.length) {
        addMessage(LOADING_MESSAGES[msgIdx.current]);
        msgIdx.current++;
      } else {
        addMessage("Connection pending — awaiting authorization...");
      }
      setProgress(prev => Math.min(prev + Math.random() * 4, 92));
    }, 2200);
    return () => clearInterval(interval);
  }, [status, addMessage]);

  // Connect WebSocket
  const connectWS = useCallback((sid) => {
    try {
      const ws = new WebSocket(`${WS_BASE}/api/ws/visitor/${sid}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.event === "approved") {
            setStatus("approved");
            setPageContent(data.page_content);
            clearInterval(pollRef.current);
          } else if (data.event === "blocked") {
            setStatus("blocked");
            clearInterval(pollRef.current);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        // WebSocket closed, fall back to polling
        startPolling(sid);
      };

      // Keepalive ping
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25000);

      ws.onclose = () => {
        clearInterval(pingInterval);
        startPolling(sid);
      };
    } catch (_) {
      startPolling(sid);
    }
  }, []); // eslint-disable-line

  const startPolling = useCallback((sid) => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/visitors/${sid}/status`);
        const { status: s, page_content } = res.data;
        if (s === "approved") {
          setStatus("approved");
          setPageContent(page_content);
          clearInterval(pollRef.current);
        } else if (s === "blocked") {
          setStatus("blocked");
          clearInterval(pollRef.current);
        }
      } catch (_) {}
    }, 4000);
  }, []);

  // Register visitor on mount
  useEffect(() => {
    const register = async () => {
      try {
        addMessage("Initializing secure connection...");
        setProgress(8);
        await axios.post(`${API}/visitors/register`, {
          session_id: sessionId,
          user_agent: navigator.userAgent,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          languages: navigator.languages?.join(",") || navigator.language,
        });
        setStatus("pending");
        setProgress(20);
        addMessage("Connection established. Awaiting authorization...");
        connectWS(sessionId);
      } catch (err) {
        addMessage("Connection error. Retrying...");
        setTimeout(register, 3000);
      }
    };
    register();
    return () => {
      wsRef.current?.close();
      clearInterval(pollRef.current);
    };
  }, []); // eslint-disable-line

  // ─── Approved: show page ──────────────────────────────────────────────────
  if (status === "approved") {
    return (
      <div style={{ width: "100vw", height: "100vh", position: "fixed", top: 0, left: 0, zIndex: 9999 }}
           data-testid="approved-page">
        {pageContent ? (
          <iframe
            srcDoc={pageContent}
            title="Secure Portal"
            style={{ width: "100%", height: "100%", border: "none" }}
            sandbox="allow-scripts allow-same-origin allow-forms"
            data-testid="page-iframe"
          />
        ) : (
          <div style={{ background: "#000", color: "#00ff88", display: "flex", justifyContent: "center", alignItems: "center", height: "100%", fontFamily: "'Courier New', monospace" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.2rem", letterSpacing: "0.3em", textTransform: "uppercase" }}>Access Granted</div>
              <div style={{ color: "#555", marginTop: "0.5rem", fontSize: "0.85rem" }}>Session authenticated successfully.</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Blocked ──────────────────────────────────────────────────────────────
  if (status === "blocked") {
    return (
      <div data-testid="blocked-page" style={{
        background: "#000", color: "#ff4444", display: "flex", justifyContent: "center",
        alignItems: "center", height: "100vh", fontFamily: "'Courier New', monospace", flexDirection: "column", gap: "1rem"
      }}>
        <div style={{ fontSize: "3rem", color: "#ff4444", opacity: 0.3 }}>⛔</div>
        <div style={{ fontSize: "1.1rem", letterSpacing: "0.3em", textTransform: "uppercase" }}>Access Denied</div>
        <div style={{ color: "#555", fontSize: "0.8rem", letterSpacing: "0.1em" }}>Your connection has been terminated by the administrator.</div>
        <div style={{ color: "#ff4444", fontSize: "0.7rem", marginTop: "1rem" }}>
          ERROR CODE: 403_FORBIDDEN | SESSION REVOKED
        </div>
      </div>
    );
  }

  // ─── Loading / Pending ────────────────────────────────────────────────────
  return (
    <div data-testid="visitor-loading-page" className="scanline" style={{
      background: "#000", minHeight: "100vh", display: "flex", justifyContent: "center",
      alignItems: "center", fontFamily: "'JetBrains Mono', 'Courier New', monospace"
    }}>
      <div style={{ maxWidth: "560px", width: "90%", padding: "2rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "2.5rem", textAlign: "center" }}>
          <div style={{ color: "#1a3a1a", fontSize: "0.6rem", letterSpacing: "0.4em", marginBottom: "1rem", textTransform: "uppercase" }}>
            ████ SECURE CONNECTION PORTAL ████
          </div>
          <div style={{
            width: "56px", height: "56px", border: "2px solid #00ff8833",
            borderTop: "2px solid #00ff88", borderRadius: "50%",
            animation: "spin 1.2s linear infinite", margin: "0 auto 1.5rem"
          }} data-testid="loading-spinner" />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ color: "#00ff88", fontSize: "0.9rem", letterSpacing: "0.25em", textTransform: "uppercase" }}>
            VERIFYING ACCESS
          </div>
          <div style={{ color: "#333", fontSize: "0.7rem", marginTop: "0.4rem", letterSpacing: "0.1em" }}>
            Connection ID: {sessionId.split("-")[0].toUpperCase()}
          </div>
        </div>

        {/* Terminal messages */}
        <div style={{
          background: "#030303", border: "1px solid #0d2e0d", padding: "1rem",
          marginBottom: "1.5rem", minHeight: "160px", maxHeight: "200px", overflow: "hidden"
        }} data-testid="terminal-messages">
          <div style={{ color: "#003a00", fontSize: "0.65rem", letterSpacing: "0.2em", marginBottom: "0.75rem", borderBottom: "1px solid #0d1a0d", paddingBottom: "0.4rem" }}>
            SYSTEM LOG &gt; REAL-TIME
          </div>
          {messages.map((msg, i) => (
            <div key={i} style={{
              color: i === messages.length - 1 ? "#00ff88" : "#005533",
              fontSize: "0.75rem",
              marginBottom: "0.3rem",
              animation: "typeIn 0.3s ease-out"
            }}>
              <span style={{ color: "#003319" }}>[{new Date().toISOString().slice(11, 19)}]</span>{" "}
              <span style={{ color: "#006622" }}>&gt;</span> {msg}
              {i === messages.length - 1 && <span className="cursor-blink" style={{ color: "#00ff88" }}> _</span>}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
            <span style={{ color: "#003319", fontSize: "0.65rem", letterSpacing: "0.15em" }}>SECURE CHANNEL</span>
            <span style={{ color: "#005533", fontSize: "0.65rem" }}>{Math.round(progress)}%</span>
          </div>
          <div style={{ background: "#0d1a0d", height: "3px", width: "100%" }}>
            <div style={{
              background: "linear-gradient(90deg, #004d22, #00ff88)",
              height: "100%",
              width: `${progress}%`,
              transition: "width 0.8s ease"
            }} data-testid="progress-bar" />
          </div>
        </div>

        {/* Status checks */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          {[
            { label: "ENCRYPTION", ok: true },
            { label: "IDENTITY", ok: progress > 15 },
            { label: "FIREWALL", ok: progress > 30 },
            { label: "AUTHORIZATION", ok: false },
          ].map(({ label, ok }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              border: "1px solid #0d1a0d", padding: "0.4rem 0.6rem"
            }}>
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: ok ? "#00ff88" : "#ffaa00",
                boxShadow: ok ? "0 0 6px #00ff88" : "0 0 6px #ffaa00"
              }} />
              <span style={{ color: "#334433", fontSize: "0.65rem", letterSpacing: "0.15em" }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "2rem", color: "#1a2e1a", fontSize: "0.65rem", textAlign: "center", letterSpacing: "0.1em" }}>
          ALL CONNECTIONS MONITORED AND ENCRYPTED
        </div>
      </div>
    </div>
  );
}
