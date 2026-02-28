# Admin Panel Multi-Page Rotation Feature

## Overview
This enhancement adds the ability for admins to approve visitors and direct them through up to 6 pages continuously, with full control to advance pages, pause, or stop rotation.

## Features
- **Single Page Mode**: Traditional approve with single page assignment
- **Rotation Mode**: Select 2-6 pages to cycle through automatically
- **Configurable Intervals**: Set rotation speed (1-60 seconds per page)
- **Manual Controls**: Skip to next page or stop rotation anytime
- **Visual Feedback**: 
  - "ROTATING" status with orange indicator in visitor table
  - Real-time rotation counter overlay on visitor's screen
  - Admin controls (next/pause buttons) for active rotations

## Implementation Steps

### 1. Update Frontend Components

#### Replace VisitorManager Component
```bash
# Backup original
cp frontend/src/components/admin/VisitorManager.jsx frontend/src/components/admin/VisitorManager.jsx.backup

# Use enhanced version (copy content from VisitorManagerEnhanced.jsx)
cp frontend/src/components/admin/VisitorManagerEnhanced.jsx frontend/src/components/admin/VisitorManager.jsx
```

#### Replace VisitorPage Component
```bash
# Backup original
cp frontend/src/components/VisitorPage.jsx frontend/src/components/VisitorPage.jsx.backup

# Use enhanced version (copy content from VisitorPageEnhanced.jsx)
cp frontend/src/components/VisitorPageEnhanced.jsx frontend/src/components/VisitorPage.jsx
```

### 2. Update Backend

The backend has already been updated with:

1. **New Pydantic Model** (server.py line ~150):
   ```python
   class PageRotationRequest(BaseModel):
       page_ids: List[str]
       interval_ms: int = 5000
   ```

2. **Three New Endpoints**:
   - `PUT /api/visitors/{visitor_id}/approve/rotate` - Start rotation
   - `PUT /api/visitors/{visitor_id}/rotation/next` - Advance to next page
   - `PUT /api/visitors/{visitor_id}/rotation/stop` - Stop rotation

### 3. Database Schema Updates
Visitors collection will now store rotation metadata:
```javascript
{
  id: "...",
  ip: "...",
  status: "approved",
  
  // New fields for rotation
  is_rotating: true,
  rotation_pages: ["page_id_1", "page_id_2", "page_id_3"],
  rotation_interval: 5000,  // milliseconds
  current_page_index: 0,
  
  // ... existing fields
}
```

## Usage Flow

### Admin Workflow

1. **View Visitor List**
   - See all pending visitors with their details
   - Filter by status or bot classification

2. **Click Approve Button**
   - Opens modal with two mode options
   - "SINGLE PAGE" - Traditional single page assignment
   - "ROTATE (UP TO 6)" - Multi-page rotation mode

3. **Rotation Mode Setup**
   - Select 2-6 pages from dropdown
   - Set rotation interval (1000-60000ms)
   - Display shows "X/6 pages selected"
   - Click "START ROTATION"

4. **Control Active Rotation**
   - Visitor status shows "ROTATING" with orange indicator
   - Admin actions in table:
     - ⏩ Skip to next page (FastForward icon)
     - ⏸ Stop rotation (Pause icon)
   - Rotation stops → visitor frozen on current page

### Visitor Experience

1. **Pending Screen**
   - Standard loading/verification screen
   - Waits for admin approval

2. **Single Page Mode**
   - Receives approval event with single page content
   - Display shows page normally
   - No rotation overlay

3. **Rotation Mode**
   - Receives approval event with rotation metadata
   - First page displays
   - Orange indicator overlay at bottom shows:
     - Current page number: "Page 2/4"
     - Rotation speed: "5.0s cycle"
     - Real-time rotation indicator (pulsing dot)
   - Pages auto-advance on schedule
   - Can receive manual advance commands from admin

## API Endpoints

### Start Rotation
```
PUT /api/visitors/{visitor_id}/approve/rotate
Content-Type: application/json

{
  "page_ids": ["page_1", "page_2", "page_3"],
  "interval_ms": 5000
}

Response:
{
  "success": true,
  "rotation_mode": true,
  "pages": 3
}
```

### Advance Page Manually
```
PUT /api/visitors/{visitor_id}/rotation/next

Response:
{
  "success": true,
  "page_index": 1,
  "total_pages": 3
}
```

### Stop Rotation
```
PUT /api/visitors/{visitor_id}/rotation/stop

Response:
{
  "success": true
}
```

## WebSocket Events

### From Backend to Visitor
- `approved` - Initial approval (with rotation_mode flag)
- `rotate_page` - Manual page advance command
- `stop_rotation` - Admin stops rotation

### Event Payloads

```javascript
// Approval with rotation
{
  event: "approved",
  page_content: "...",
  rotation_mode: true,
  page_ids: ["page_1", "page_2"],
  interval_ms: 5000,
  current_page_index: 0
}

// Manual page advance
{
  event: "rotate_page",
  page_content: "...",
  page_index: 1,
  total_pages: 3
}

// Stop rotation
{
  event: "stop_rotation",
  page_content: "..."
}
```

## UI Components

### VisitorManager Enhancements
- Toggle buttons: "SINGLE PAGE" vs "ROTATE (UP TO 6)"
- Multi-select checkboxes for page selection
- Interval input (ms): 1000-60000
- Updated action buttons for rotating visitors
- Rotation status indicator (orange, pulsing)
- Rotation counter display

### VisitorPage Enhancements
- Rotation metadata storage
- Auto-rotation interval management
- Rotation overlay indicator:
  - Position: bottom center, fixed
  - Shows: "Rotation: Page X/Y • Zs cycle"
  - Orange color (#ff9900) with pulsing animation
- WebSocket message handlers for rotation events
- Manual page control reception from admin

## State Management

### Frontend State Variables
```javascript
// In VisitorManager:
isRotating              // Toggle between modes
selectedPages           // Array of selected page IDs
rotationInterval        // Milliseconds between pages
rotationModal           // Modal visibility

// In VisitorPage:
isRotating              // Is in rotation mode
rotationPages           // Array of page IDs
rotationInterval        // Auto-rotate delay
currentPageIndex        // Current position in rotation
```

## Error Handling

### Validation
- Minimum 2 pages required for rotation
- Maximum 6 pages allowed
- All page IDs must exist in database
- Interval must be 1000-60000ms

### Edge Cases
- If visitor disconnects during rotation, resume on reconnect
- If page is deleted, rotation continues with remaining pages
- WebSocket fallback to polling maintains rotation state

## Testing Checklist

- [ ] Admin can toggle between single and rotation modes
- [ ] At least 2 pages required to start rotation
- [ ] Maximum 6 pages enforced
- [ ] Rotation interval adjustable (1-60 seconds)
- [ ] Visitor receives correct page on approval
- [ ] Rotation overlay displays correctly
- [ ] Manual next/pause buttons work
- [ ] Rotation stops and freezes current page
- [ ] Visitor status shows "ROTATING" with orange indicator
- [ ] Admin refresh shows correct rotation state
- [ ] WebSocket reconnection maintains rotation state
- [ ] Polling fallback maintains rotation state

## Backward Compatibility

- Existing single-page approval flow unchanged
- Old visitor records without rotation fields work normally
- Default values handle missing rotation metadata
- No database migration required (schema flexible)

## Performance Notes

- Rotation timing is browser-based (no server polling)
- WebSocket handles page changes efficiently
- Minimal overhead for inactive rotations
- No continuous polling for rotation state
