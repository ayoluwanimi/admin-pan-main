import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { CheckCircle, XCircle, Trash2, RefreshCw, Globe, Bot, Monitor, Pause, FastForward } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const statusColor = (s) => ({
  approved: "#00ff88", blocked: "#ff4444", pending: "#ffaa00"
}[s] || "#555");

export default function VisitorManager({ liveEvents }) {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState([]);
  const [approveModal, setApproveModal] = useState(null);
  const [selectedPage, setSelectedPage] = useState("");
  const [filter, setFilter] = useState("all");
  
  const [selectedPages, setSelectedPages] = useState([]);
  const [rotationInterval, setRotationInterval] = useState(5000); 
  const [isRotatingMode, setIsRotatingMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vr, pr] = await Promise.all([
        axios.get(`${API}/visitors`),
        axios.get(`${API}/pages`),
      ]);
      setVisitors(vr.data);
      setPages(pr.data);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!liveEvents?.length) return;
    const ev = liveEvents[0];
    if (ev.event === "new_visitor" && ev.visitor) {
      setVisitors(prev => [ev.visitor, ...prev]);
    }
    if (ev.event === "visitor_updated") {
      setVisitors(prev => prev.map(v => v.id === ev.visitor_id ? { 
        ...v, 
        status: ev.status, 
        is_rotating: ev.is_rotating !== undefined ? ev.is_rotating : v.is_rotating 
      } : v));
    }
    if (ev.event === "visitor_deleted") {
      setVisitors(prev => prev.filter(v => v.id !== ev.visitor_id));
    }
  }, [liveEvents]);

  const handleApprove = async (visitor) => {
    setApproveModal(visitor);
    setSelectedPage("");
    setSelectedPages([]);
    setIsRotatingMode(false);
  };

  const confirmApprove = async () => {
    if (!approveModal) return;
    try {
      await axios.put(`${API}/visitors/${approveModal.id}/approve`, { page_id: selectedPage || null });
      setVisitors(prev => prev.map(v => v.id === approveModal.id ? { ...v, status: "approved", is_rotating: false } : v));
      setApproveModal(null);
    } catch (_) {}
  };

  const handleStartRotation = async () => {
    if (!approveModal || selectedPages.length < 2) return;
    try {
      await axios.put(`${API}/visitors/${approveModal.id}/approve/rotate`, {
        page_ids: selectedPages,
        interval_ms: rotationInterval
      });
      setVisitors(prev => prev.map(v => v.id === approveModal.id ? {
        ...v,
        status: "approved",
        is_rotating: true
      } : v));
      setApproveModal(null);
    } catch (err) {
      console.error("Rotation start failed:", err);
    }
  };

  const handleStopRotation = async (visitorId) => {
    try {
      await axios.put(`${API}/visitors/${visitorId}/rotation/stop`);
      setVisitors(prev => prev.map(v => v.id === visitorId ? {
        ...v,
        is_rotating: false
      } : v));
    } catch (err) {
      console.error("Rotation stop failed:", err);
    }
  };

  const handleRotationNext = async (visitorId) => {
    try {
      await axios.put(`${API}/visitors/${visitorId}/rotation/next`);
    } catch (err) {
      console.error("Next page failed:", err);
    }
  };

  const handleBlock = async (id) => {
    try {
      await axios.put(`${API}/visitors/${id}/block`);
      setVisitors(prev => prev.map(v => v.id === id ? { ...v, status: "blocked", is_rotating: false } : v));
    } catch (_) {}
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/visitors/${id}`);
      setVisitors(prev => prev.filter(v => v.id !== id));
    } catch (_) {}
  };

  const filtered = visitors.filter(v => {
    if (filter === "all") return true;
    if (filter === "bot") return v.is_bot;
    return v.status === filter;
  });

  return (
    <div data-testid="visitor-manager" className="slide-up">
      {approveModal && (
        <div style={{
          position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div data-testid="approve-modal" style={{
            background: "#080808", border: "1px solid #00ff8833",
            padding: "1.5rem", width: "420px", maxHeight: "90vh", overflowY: "auto"
          }}>
            <div style={{ color: "#00ff88", fontSize: "0.8rem", letterSpacing: "0.2em", marginBottom: "1rem" }}>
              {isRotatingMode ? "PAGE ROTATION MODE" : "APPROVE VISITOR"}
            </div>
            <div style={{ color: "#888", fontSize: "0.7rem", marginBottom: "1.2rem" }}>
              IP: {approveModal.ip} — {approveModal.city}, {approveModal.country}
            </div>

            <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setIsRotatingMode(false)}
                style={{
                  flex: 1, background: !isRotatingMode ? "#00ff88" : "transparent",
                  color: !isRotatingMode ? "#000" : "#555", border: `1px solid ${!isRotatingMode ? "#00ff88" : "#222"}`,
                  padding: "0.4rem", fontSize: "0.65rem", fontWeight: 700, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em"
                }}
              >
                SINGLE PAGE
              </button>
              <button
                onClick={() => setIsRotatingMode(true)}
                style={{
                  flex: 1, background: isRotatingMode ? "#00ff88" : "transparent",
                  color: isRotatingMode ? "#000" : "#555", border: `1px solid ${isRotatingMode ? "#00ff88" : "#222"}`,
                  padding: "0.4rem", fontSize: "0.65rem", fontWeight: 700, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em"
                }}
              >
                ROTATE (UP TO 6)
              </button>
            </div>

            {!isRotatingMode && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ color: "#555", fontSize: "0.6rem", letterSpacing: "0.15em", display: "block", marginBottom: "0.3rem" }}>
                  ASSIGN PAGE (optional)
                </label>
                <select
                  value={selectedPage}
                  onChange={e => setSelectedPage(e.target.value)}
                  style={{
                    width: "100%", background: "#0a0a0a", border: "1px solid #222",
                    color: "#ccc", padding: "0.5rem", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.75rem", outline: "none"
                  }}
                >
                  <option value="">Use Default Page</option>
                  {pages.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</option>
                  ))}
                </select>
              </div>
            )}

            {isRotatingMode && (
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ color: "#555", fontSize: "0.6rem", letterSpacing: "0.15em", display: "block", marginBottom: "0.5rem" }}>
                  SELECT PAGES TO ROTATE (2-6 pages)
                </label>
                <div style={{
                  background: "#0a0a0a", border: "1px solid #222", padding: "0.8rem",
                  maxHeight: "200px", overflowY: "auto"
                }}>
                  {pages.map(p => (
                    <label key={p.id} style={{
                      display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem",
                      cursor: "pointer", padding: "0.3rem"
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedPages.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked && selectedPages.length < 6) {
                            setSelectedPages([...selectedPages, p.id]);
                          } else if (!e.target.checked) {
                            setSelectedPages(selectedPages.filter(id => id !== p.id));
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={{ color: "#888", fontSize: "0.75rem" }}>
                        {p.name}{p.is_default ? " (default)" : ""}
                      </span>
                    </label>
                  ))}
                </div>
                <div style={{ color: "#555", fontSize: "0.65rem", marginTop: "0.5rem" }}>
                  Selected: {selectedPages.length}/6 pages
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <label style={{ color: "#555", fontSize: "0.6rem", letterSpacing: "0.15em", display: "block", marginBottom: "0.3rem" }}>
                    ROTATION INTERVAL (ms)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    max="60000"
                    step="500"
                    value={rotationInterval}
                    onChange={e => setRotationInterval(parseInt(e.target.value))}
                    style={{
                      width: "100%", background: "#0a0a0a", border: "1px solid #222",
                      color: "#ccc", padding: "0.5rem", fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.75rem", outline: "none", boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={isRotatingMode ? handleStartRotation : confirmApprove}
                disabled={isRotatingMode && selectedPages.length < 2}
                style={{
                  flex: 1, background: (isRotatingMode && selectedPages.length < 2) ? "#334433" : "#00ff88",
                  color: "#000", border: "none",
                  padding: "0.55rem", fontSize: "0.7rem", fontWeight: 700, cursor: (isRotatingMode && selectedPages.length < 2) ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.15em", opacity: (isRotatingMode && selectedPages.length < 2) ? 0.5 : 1
                }}
              >
                {isRotatingMode ? "START ROTATION" : "APPROVE"}
              </button>
              <button
                onClick={() => setApproveModal(null)}
                style={{
                  flex: 1, background: "transparent", color: "#555", border: "1px solid #222",
                  padding: "0.55rem", fontSize: "0.7rem", cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.15em"
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {["all", "pending", "approved", "blocked", "bot"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "#00ff88" : "transparent",
                color: filter === f ? "#000" : "#444",
                border: `1px solid ${filter === f ? "#00ff88" : "#222"}`,
                padding: "0.3rem 0.6rem", fontSize: "0.6rem",
                cursor: "pointer", letterSpacing: "0.15em", textTransform: "uppercase",
                fontFamily: "'JetBrains Mono', monospace"
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={load} style={{
          background: "transparent", border: "1px solid #222", color: "#444",
          padding: "0.3rem 0.6rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem",
          fontSize: "0.65rem", fontFamily: "'JetBrains Mono', monospace"
        }}>
          <RefreshCw size={11} /> REFRESH
        </button>
      </div>

      <div style={{ background: "#080808", border: "1px solid #111" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #111" }}>
                {["STATUS", "IP ADDRESS", "LOCATION", "UA", "SCREEN", "BOT", "JOINED", "ACTIONS"].map(h => (
                  <th key={h} style={{
                    padding: "0.6rem 0.8rem", color: "#333", fontWeight: 700,
                    letterSpacing: "0.15em", textAlign: "left", whiteSpace: "nowrap", background: "#050505"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#333" }}>Loading...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#222" }}>No visitors found</td></tr>
              )}
              {filtered.map((v) => (
                <tr key={v.id} style={{
                  borderBottom: "1px solid #0a0a0a",
                  background: v.status === "pending" ? "#0a0800" : (v.is_rotating ? "#080a08" : "transparent")
                }}>
                  <td style={{ padding: "0.65rem 0.8rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <div style={{
                        width: "7px", height: "7px", borderRadius: "50%",
                        background: v.is_rotating ? "#ff9900" : statusColor(v.status),
                        boxShadow: v.is_rotating ? "0 0 6px #ff9900" : (v.status === "pending" ? "0 0 6px #ffaa00" : "none")
                      }} />
                      <span style={{ color: v.is_rotating ? "#ff9900" : statusColor(v.status), letterSpacing: "0.1em" }}>
                        {v.is_rotating ? "ROTATING" : v.status?.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem", color: "#ccc", fontFamily: "monospace" }}>{v.ip}</td>
                  <td style={{ padding: "0.65rem 0.8rem", color: "#888" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <Globe size={10} /> {v.city}, {v.country}
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem", color: "#555", maxWidth: "150px" }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.user_agent?.slice(0, 30)}...
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem", color: "#555" }}>
                    <Monitor size={10} /> {v.screen}
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem" }}>
                    {v.is_bot ? <span style={{ color: "#ff6600" }}><Bot size={11} /> BOT</span> : <span style={{ color: "#333" }}>—</span>}
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem", color: "#444" }}>
                    {v.created_at?.slice(11, 16)}
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {v.status !== "approved" && !v.is_rotating && (
                        <button onClick={() => handleApprove(v)} title="Approve" style={{ background: "none", border: "none", color: "#00ff88", cursor: "pointer" }}>
                          <CheckCircle size={15} />
                        </button>
                      )}
                      {v.is_rotating && (
                        <>
                          <button onClick={() => handleRotationNext(v.id)} title="Next Page" style={{ background: "none", border: "none", color: "#ff9900", cursor: "pointer" }}>
                            <FastForward size={14} />
                          </button>
                          <button onClick={() => handleStopRotation(v.id)} title="Stop Rotation" style={{ background: "none", border: "none", color: "#ff6600", cursor: "pointer" }}>
                            <Pause size={14} />
                          </button>
                        </>
                      )}
                      {v.status !== "blocked" && (
                        <button onClick={() => handleBlock(v.id)} title="Block" style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer" }}>
                          <XCircle size={15} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(v.id)} title="Delete" style={{ background: "none", border: "none", color: "#444", cursor: "pointer" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
