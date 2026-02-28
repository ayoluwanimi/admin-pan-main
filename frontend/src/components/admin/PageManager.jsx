import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Plus, Pencil, Trash2, Star, Eye, X, Upload } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const STARTER_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>My Page</title>
  <style>
    body { background: #000; color: #0f0; font-family: monospace; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .wrap { text-align: center; padding: 2rem; }
    h1 { font-size: 1.2rem; letter-spacing: 0.3em; text-transform: uppercase; margin-bottom: 1rem; }
    p { color: #555; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Welcome</h1>
    <p>This is your custom page. Edit the HTML below.</p>
  </div>
</body>
</html>`;

export default function PageManager() {
  const [pages, setPages] = useState([]);
  const [editing, setEditing] = useState(null); // null or page object
  const [isNew, setIsNew] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const [form, setForm] = useState({ name: "", content: STARTER_HTML, is_default: false });

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/pages`);
      setPages(res.data);
    } catch (_) {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ name: "", content: STARTER_HTML, is_default: false });
    setIsNew(true);
    setEditing(null);
  };

  const openEdit = async (page) => {
    try {
      const res = await axios.get(`${API}/pages/${page.id}`);
      setForm({ name: res.data.name, content: res.data.content, is_default: res.data.is_default });
      setEditing(res.data);
      setIsNew(false);
    } catch (_) {}
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    try {
      if (isNew) {
        await axios.post(`${API}/pages`, form);
      } else {
        await axios.put(`${API}/pages/${editing.id}`, form);
      }
      setEditing(null);
      setIsNew(false);
      await load();
    } catch (_) {}
  };

  const handleSetDefault = async (id) => {
    try {
      await axios.put(`${API}/pages/${id}`, { is_default: true });
      await load();
    } catch (_) {}
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/pages/${id}`);
      setPages(prev => prev.filter(p => p.id !== id));
    } catch (_) {}
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, content: ev.target.result, name: prev.name || file.name.replace(".html", "") }));
    };
    reader.readAsText(file);
  };

  // ─── Editor Mode ────────────────────────────────────────────────────────────
  if (isNew || editing) {
    return (
      <div data-testid="page-editor" className="slide-up">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div style={{ color: "#fff", fontSize: "0.8rem", letterSpacing: "0.2em" }}>
            {isNew ? "CREATE NEW PAGE" : `EDITING: ${editing?.name}`}
          </div>
          <button onClick={() => { setEditing(null); setIsNew(false); }} style={{ background: "none", border: "none", color: "#444", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label style={{ color: "#555", fontSize: "0.6rem", letterSpacing: "0.15em", display: "block", marginBottom: "0.3rem" }}>PAGE NAME</label>
            <input
              data-testid="page-name-input"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Landing Page"
              style={{
                width: "100%", background: "#080808", border: "1px solid #1a1a1a",
                color: "#ccc", padding: "0.5rem 0.75rem", fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.8rem", outline: "none", boxSizing: "border-box"
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#888", fontSize: "0.7rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                data-testid="page-default-check"
                checked={form.is_default}
                onChange={e => setForm(p => ({ ...p, is_default: e.target.checked }))}
                style={{ accentColor: "#00ff88" }}
              />
              Set as default visitor page
            </label>
            <label data-testid="upload-html-btn" style={{
              display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer",
              border: "1px solid #222", color: "#555", padding: "0.4rem 0.7rem",
              fontSize: "0.65rem", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em"
            }}>
              <Upload size={11} /> UPLOAD HTML
              <input type="file" accept=".html,.htm" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ color: "#555", fontSize: "0.6rem", letterSpacing: "0.15em" }}>HTML CONTENT</label>
          <button
            onClick={() => setPreviewContent(form.content)}
            data-testid="preview-btn"
            style={{
              background: "transparent", border: "1px solid #222", color: "#555",
              padding: "0.25rem 0.6rem", fontSize: "0.6rem", cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: "0.3rem"
            }}
          >
            <Eye size={11} /> PREVIEW
          </button>
        </div>

        <textarea
          data-testid="page-content-textarea"
          value={form.content}
          onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
          rows={20}
          spellCheck={false}
          style={{
            width: "100%", background: "#030303", border: "1px solid #111",
            color: "#00ff88", padding: "0.75rem", fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.75rem", outline: "none", resize: "vertical", boxSizing: "border-box",
            lineHeight: 1.6
          }}
        />

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            onClick={handleSave}
            data-testid="save-page-btn"
            style={{
              background: "#00ff88", color: "#000", border: "none",
              padding: "0.6rem 1.5rem", fontSize: "0.75rem", fontWeight: 700,
              cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.2em"
            }}
          >
            SAVE PAGE
          </button>
          <button
            onClick={() => { setEditing(null); setIsNew(false); }}
            style={{
              background: "transparent", color: "#444", border: "1px solid #222",
              padding: "0.6rem 1rem", fontSize: "0.75rem", cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace"
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="page-manager" className="slide-up">
      {/* Preview modal */}
      {previewContent && (
        <div style={{
          position: "fixed", inset: 0, background: "#000000ee", zIndex: 1000,
          display: "flex", flexDirection: "column"
        }}>
          <div style={{ background: "#050505", padding: "0.6rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #111" }}>
            <span style={{ color: "#00ff88", fontSize: "0.7rem", letterSpacing: "0.2em" }}>PAGE PREVIEW</span>
            <button onClick={() => setPreviewContent(null)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>
          <iframe
            srcDoc={previewContent}
            title="Preview"
            sandbox="allow-scripts allow-same-origin"
            style={{ flex: 1, border: "none" }}
            data-testid="preview-iframe"
          />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div style={{ color: "#555", fontSize: "0.7rem" }}>{pages.length} page(s) in database</div>
        <button
          onClick={openNew}
          data-testid="new-page-btn"
          style={{
            background: "#00ff88", color: "#000", border: "none",
            padding: "0.5rem 1rem", fontSize: "0.7rem", fontWeight: 700,
            cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.15em", display: "flex", alignItems: "center", gap: "0.4rem"
          }}
        >
          <Plus size={14} /> NEW PAGE
        </button>
      </div>

      {pages.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#222", border: "1px dashed #111" }}>
          No pages yet. Create your first page.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {pages.map(p => (
            <div key={p.id} data-testid={`page-card-${p.id}`} style={{
              background: "#080808", border: `1px solid ${p.is_default ? "#00ff8833" : "#111"}`,
              padding: "0.9rem 1rem", display: "flex", alignItems: "center", gap: "1rem"
            }}>
              {p.is_default && <Star size={13} color="#00ff88" />}
              <div style={{ flex: 1 }}>
                <div style={{ color: p.is_default ? "#00ff88" : "#ccc", fontSize: "0.8rem" }}>
                  {p.name}
                  {p.is_default && <span style={{ color: "#00ff8866", fontSize: "0.6rem", marginLeft: "0.5rem" }}>DEFAULT</span>}
                </div>
                <div style={{ color: "#333", fontSize: "0.6rem", marginTop: "0.2rem" }}>
                  Created: {p.created_at?.slice(0, 16).replace("T", " ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  data-testid={`edit-page-${p.id}`}
                  onClick={() => openEdit(p)}
                  title="Edit"
                  style={{ background: "none", border: "none", color: "#555", cursor: "pointer" }}
                >
                  <Pencil size={14} />
                </button>
                {!p.is_default && (
                  <button
                    onClick={() => handleSetDefault(p.id)}
                    data-testid={`set-default-${p.id}`}
                    title="Set as default"
                    style={{ background: "none", border: "none", color: "#ffaa00", cursor: "pointer" }}
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  data-testid={`preview-page-${p.id}`}
                  onClick={async () => {
                    const r = await axios.get(`${API}/pages/${p.id}`);
                    setPreviewContent(r.data.content);
                  }}
                  title="Preview"
                  style={{ background: "none", border: "none", color: "#005533", cursor: "pointer" }}
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  data-testid={`delete-page-${p.id}`}
                  title="Delete"
                  style={{ background: "none", border: "none", color: "#ff444466", cursor: "pointer" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
