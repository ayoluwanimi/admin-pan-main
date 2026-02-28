import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { CheckCircle, XCircle, Trash2, RefreshCw, Globe, Bot, Monitor, Play, Pause, FastForward, RotateCw } from "lucide-react";

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
  
  // Multi-page rotation state
  const [rotationModal, setRotationModal] = useState(null);
  const [selectedPages, setSelectedPages] = useState([]);
  const [rotationInterval, setRotationInterval] = useState(5000); // 5 seconds default
  const [isRotating, setIsRotating] = useState(false);

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
      setVisitors(prev => prev.map(v => v.id === ev.visitor_id ? { ...v, status: ev.status } : v));
    }
    if (ev.event === "visitor_deleted") {
      setVisitors(prev => prev.filter(v => v.id !== ev.visitor_id));
    }
  }, [liveEvents]);

  const handleApprove = async (visitor) => {
    setApproveModal(visitor);
    setSelectedPage("");
    setSelectedPages([]);
    setIsRotating(false);
  };

  const confirmApprove = async () => {
    if (!approveModal) return;
    try {
      await axios.put(`${API}/visitors/${approveModal.id}/approve`, { page_id: selectedPage || null });
      setVisitors(prev => prev.map(v => v.id === approveModal.id ? { ...v, status: "approved" } : v));
      setApproveModal(null);
    } catch (_) {}
  };

  const handleStartRotation = async () => {
    if (!approveModal || selectedPages.length === 0) return;
    try {
      await axios.put(`${API}/visitors/${approveModal.id}/approve/rotate`, {
        page_ids: selectedPages,
        interval_ms: rotationInterval
      });
      setVisitors(prev => prev.map(v => v.id === approveModal.id ? {
        ...v,
        status: "approved",
        rotation_pages: selectedPages,
        rotation_interval: rotationInterval,
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
        is_rotating: false,
        rotation_pages: null
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
      setVisitors(prev => prev.map(v => v.id === id ? { ...v, status: "blocked" } : v));
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
      {/* Approve/Rotation Modal */}
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
              {isRotating ? "PAGE ROTATION MODE" : "APPROVE VISITOR"}
            </div>
            <div style={{ color: "#888", fontSize: "0.7rem", marginBottom: "1.2rem" }}>
              IP: {approveModal.ip} — {approveModal.city}, {approveModal.country}
            </div>

            {/* Toggle between single page and rotation mode */}
            <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setIsRotating(false)}
                style={{
                  flex: 1, background: !isRotating ? "#00ff88" : "transparent",
                  color: !isRotating ? "#000" : "#555", border: `1px solid ${!isRotating ? "#00ff88" : "#222"}`,
                  padding: "0.4rem", fontSize: "0.65rem", fontWeight: 700, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em"
                }}
              >
                SINGLE PAGE
              </button>
              <button
                onClick={() => setIsRotating(true)}
                style={{
                  flex: 1, background: isRotating ? "#00ff88" : "transparent",
                  color: isRotating ? "#000" : "#555", border: `1px solid ${isRotating ? "#00ff88" : "#222"}`,
                  padding: "0.4rem", fontSize: "0.65rem", fontWeight: 700, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em"
                }}
              >
                ROTATE (UP TO 6)
              </button>
            </div>

            {/* Single Page Selection */}
            {!isRotating && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ color: "#555", fontSize: "0.6rem", letterSpacing: "0.15em", display: "block", marginBottom: "0.3rem" }}>
                  ASSIGN PAGE (optional)
                </label>
                <select
                  value={selectedPage}
                  onChange={e => setSelectedPage(e.target.value)}
                  data-testid="page-select"
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

            {/* Multi-Page Rotation Selection */}
            {isRotating && (
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

                {/* Rotation Interval */}
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
                  <div style={{ color: "#555", fontSize: "0.65rem", marginTop: "0.3rem" }}>
                    {(rotationInterval / 1000).toFixed(1)}s per page
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={isRotating ? handleStartRotation : confirmApprove}
                disabled={isRotating && selectedPages.length < 2}
                data-testid="confirm-approve-btn"
                style={{
                  flex: 1, background: (isRotating && selectedPages.length < 2) ? "#334433" : "#00ff88",
                  color: "#000", border: "none",
                  padding: "0.55rem", fontSize: "0.7rem", fontWeight: 700, cursor: (isRotating && selectedPages.length < 2) ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.15em", opacity: (isRotating && selectedPages.length < 2) ? 0.5 : 1
                }}
              >
                {isRotating ? "START ROTATION" : "APPROVE"}
              </button>
              <button
                onClick={() => setApproveModal(null)}
                data-testid="cancel-approve-btn"
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

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {["all", "pending", "approved", "blocked", "bot"].map(f => (
            <button
              key={f}
              data-testid={`filter-${f}`}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "#00ff88" : "transparent",
                color: filter === f ? "#000" : "#444",
                border: `1px solid ${filter === f ? "#00ff88" : "#222"}`,
                padding: "0.3rem 0.6rem", fontSize: "0.6rem",
                cursor: "pointer", letterSpacing: "0.15em", textTransform: "uppercase",
                fontFamily: "'JetBrains Mono', monospace", transition: "color 0.2s, background 0.2s"
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={load} data-testid="refresh-visitors" style={{
          background: "transparent", border: "1px solid #222", color: "#444",
          padding: "0.3rem 0.6rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem",
          fontSize: "0.65rem", fontFamily: "'JetBrains Mono', monospace"
        }}>
          <RefreshCw size={11} /> REFRESH
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#080808", border: "1px solid #111" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #111" }}>
                {["STATUS", "IP ADDRESS", "LOCATION", "BROWSER / UA", "SCREEN", "BOT", "JOINED", "ACTIONS"].map(h => (
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
                <tr key={v.id} data-testid={`visitor-row-${v.id}`} style={{
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
                      <Globe size={10} />
                      {v.city}, {v.country}
                    </div>
                    <div style={{ color: "#333", fontSize: "0.6rem" }}>{v.isp?.slice(0, 25)}</div>
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem", color: "#555", maxWidth: "180px" }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.user_agent?.slice(0, 45)}...
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem", color: "#555" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <Monitor size={10} /> {v.screen}
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem" }}>
                    {v.is_bot ? (
                      <span style={{ color: "#ff6600", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <Bot size={11} /> BOT
                      </span>
                    ) : (
                      <span style={{ color: "#333" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem", color: "#444", whiteSpace: "nowrap" }}>
                    {v.created_at?.slice(0, 16).replace("T", " ")}
                  </td>
                  <td style={{ padding: "0.65rem 0.8rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {v.status !== "approved" && !v.is_rotating && (
                        <button
                          data-testid={`approve-btn-${v.id}`}
                          onClick={() => handleApprove(v)}
                          title="Approve"
                          style={{ background: "none", border: "none", color: "#00ff88", cursor: "pointer", padding: "2px" }}
                        >
                          <CheckCircle size={15} />
                        </button>
                      )}
                      {v.is_rotating && (
                        <>
                          <button
                            onClick={() => handleRotationNext(v.id)}
                            title="Next Page"
                            style={{ background: "none", border: "none", color: "#ff9900", cursor: "pointer", padding: "2px" }}
                          >
                            <FastForward size={14} />
                          </button>
                          <button
                            onClick={() => handleStopRotation(v.id)}
                            title="Stop Rotation"
                            style={{ background: "none", border: "none", color: "#ff6600", cursor: "pointer", padding: "2px" }}
                          >
                            <Pause size={14} />
                          </button>
                        </>
                      )}
                      {v.status !== "blocked" && !v.is_rotating && (
                        <button
                          data-testid={`block-btn-${v.id}`}
                          onClick={() => handleBlock(v.id)}
                          title="Block"
                          style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", padding: "2px" }}
                        >
                          <XCircle size={15} />
                        </button>
                      )}
                      <button
                        data-testid={`delete-btn-${v.id}`}
                        onClick={() => handleDelete(v.id)}
                        title="Delete"
                        style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: "2px" }}
                      >
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

      <div style={{ marginTop: "0.5rem", color: "#333", fontSize: "0.6rem" }}>
        {filtered.length} record(s) shown
      </div>
    </div>
  );
}
