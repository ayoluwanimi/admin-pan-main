# Installation Guide: Multi-Page Rotation Feature

## Quick Start

### Option 1: Direct File Replacement

```bash
# Navigate to project root
cd /path/to/admin-pan-main

# Backup existing files
mkdir -p backups
cp frontend/src/components/admin/VisitorManager.jsx backups/
cp frontend/src/components/VisitorPage.jsx backups/

# Copy new component versions (content from *Enhanced.jsx files)
# Or manually apply the changes outlined below
```

### Option 2: Manual Integration

If you prefer to manually integrate the changes:

#### Step 1: Update VisitorManager.jsx

**Add to imports:**
```javascript
import { Play, Pause, FastForward, RotateCw } from "lucide-react";
```

**Add state variables:**
```javascript
const [rotationModal, setRotationModal] = useState(null);
const [selectedPages, setSelectedPages] = useState([]);
const [rotationInterval, setRotationInterval] = useState(5000);
const [isRotating, setIsRotating] = useState(false);
```

**Add functions:**
```javascript
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
```

**Update modal UI** - Replace the approval modal with extended version that includes rotation mode toggle, multi-select pages, and interval input.

**Update actions column** - Add rotation control buttons (FastForward, Pause) when `is_rotating` is true.

**Update status display** - Show "ROTATING" status with orange indicator when `is_rotating` is true.

#### Step 2: Update VisitorPage.jsx

**Add to imports:**
```javascript
// No new imports needed - use existing ones
```

**Add state for rotation:**
```javascript
const [isRotating, setIsRotating] = useState(false);
const [rotationPages, setRotationPages] = useState([]);
const [rotationInterval, setRotationInterval] = useState(5000);
const [currentPageIndex, setCurrentPageIndex] = useState(0);
const rotationIntervalRef = useRef(null);
```

**Add rotation auto-advance effect:**
```javascript
useEffect(() => {
  if (!isRotating || rotationPages.length === 0) {
    if (rotationIntervalRef.current) clearInterval(rotationIntervalRef.current);
    return;
  }
  
  rotationIntervalRef.current = setInterval(() => {
    setCurrentPageIndex(prev => (prev + 1) % rotationPages.length);
  }, rotationInterval);
  
  return () => {
    if (rotationIntervalRef.current) clearInterval(rotationIntervalRef.current);
  };
}, [isRotating, rotationPages.length, rotationInterval]);
```

**Update WebSocket message handler:**
```javascript
ws.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    
    if (data.event === "approved") {
      setStatus("approved");
      setPageContent(data.page_content);
      
      // Handle rotation mode
      if (data.rotation_mode) {
        setIsRotating(true);
        setRotationPages(data.page_ids || []);
        setRotationInterval(data.interval_ms || 5000);
        setCurrentPageIndex(data.current_page_index || 0);
        addMessage("Rotation mode activated. Cycling through pages...");
      }
      
      clearInterval(pollRef.current);
    } 
    else if (data.event === "rotate_page") {
      setPageContent(data.page_content);
      setCurrentPageIndex(data.page_index || 0);
      addMessage(`Advanced to page ${(data.page_index || 0) + 1}/${data.total_pages || 1}`);
    }
    else if (data.event === "stop_rotation") {
      setIsRotating(false);
      setPageContent(data.page_content);
      setRotationPages([]);
      addMessage("Rotation stopped. Holding current page...");
    }
  } catch (_) {}
};
```

**Add rotation indicator overlay:**
```javascript
{/* Add inside approved page render, after iframe */}
{isRotating && rotationPages.length > 0 && (
  <div style={{
    position: "fixed", bottom: "1rem", left: "50%", transform: "translateX(-50%)",
    background: "#000000dd", border: "1px solid #ff9900", borderRadius: "4px",
    padding: "0.6rem 1rem", color: "#ff9900", fontSize: "0.75rem",
    fontFamily: "'JetBrains Mono', monospace", zIndex: 10000,
    display: "flex", alignItems: "center", gap: "0.8rem"
  }}>
    <div style={{
      width: "8px", height: "8px", borderRadius: "50%", background: "#ff9900",
      animation: "pulse 1s infinite"
    }} />
    <span>Rotation: Page {currentPageIndex + 1}/{rotationPages.length} • {(rotationInterval / 1000).toFixed(1)}s cycle</span>
    <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
  </div>
)}
```

**Update cleanup on unmount:**
```javascript
return () => {
  wsRef.current?.close();
  clearInterval(pollRef.current);
  if (rotationIntervalRef.current) clearInterval(rotationIntervalRef.current);
};
```

#### Step 3: Update Backend (server.py)

**Add import (if not already present):**
```python
from typing import List
```

**Add Pydantic model (around line 150):**
```python
class PageRotationRequest(BaseModel):
    page_ids: List[str]
    interval_ms: int = 5000
```

**Add three new endpoints after `/visitors/{visitor_id}/approve`:**
- See `backend_rotation_endpoints.py` for complete code

**Key points:**
- Validates 2-6 pages
- Checks all page IDs exist
- Updates visitor with rotation metadata
- Sends WebSocket notification with rotation info
- Handles manual advance and stop commands

## Verification Steps

After applying changes:

```bash
# Frontend
cd frontend
npm start
# Should compile without errors

# Backend
cd backend
python server.py
# Should start without import/syntax errors
```

### Manual Testing

1. **Start admin panel**
   - Navigate to Visitors section
   - Verify UI loads correctly

2. **Create test pages**
   - Admin > Pages
   - Create at least 3 test pages with distinct content

3. **Test single approval**
   - Visitor registers
   - Approve with single page
   - Verify normal behavior unchanged

4. **Test rotation mode**
   - Visitor registers
   - Click approve button
   - Switch to "ROTATE (UP TO 6)"
   - Select 2-3 pages
   - Set interval to 3000ms (3 seconds)
   - Click "START ROTATION"
   - Verify:
     - Visitor row shows "ROTATING" status
     - Visitor receives pages in sequence
     - Overlay shows page counter and interval

5. **Test manual controls**
   - While rotation active, click ⏩ button
   - Verify page advances
   - Click ⏸ button
   - Verify rotation stops and page freezes

6. **Test admin refresh**
   - Refresh admin panel
   - Verify rotation status persists
   - Verify visitor continues rotation (no interruption)

## Troubleshooting

### Frontend builds with errors
- Check all imports from lucide-react are included
- Verify state variable names match usage
- Check parentheses/braces are balanced

### Backend won't start
- Verify PageRotationRequest model is defined
- Check endpoint signatures match usage
- Ensure visitor table can store rotation fields

### Rotation doesn't start
- Check browser console for errors
- Verify at least 2 pages selected
- Check interval_ms is > 1000

### Pages don't advance
- Verify rotation is started (orange indicator shows)
- Check rotation interval (short delays like 1000ms work better)
- Verify WebSocket connection is active

### Visitor doesn't receive rotation info
- Check WebSocket message format
- Verify page IDs are valid
- Check backend response includes rotation_mode

## Rollback

If needed, restore original files:

```bash
cp backups/VisitorManager.jsx frontend/src/components/admin/
cp backups/VisitorPage.jsx frontend/src/components/
```

Restart both frontend and backend services.

## Performance Tuning

### For slow networks
- Increase rotation interval (5000ms or higher)
- Use simpler page content
- Test with production pages first

### For smoother transitions
- Keep interval consistent (avoid very short cycles)
- Pre-cache pages if possible
- Monitor WebSocket ping/pong timing

## Additional Notes

- All WebSocket communication maintains backward compatibility
- Database schema updates are automatic
- No migration scripts required
- Existing single-page approvals unaffected
