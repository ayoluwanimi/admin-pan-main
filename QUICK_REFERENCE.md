# Quick Reference: Multi-Page Rotation Feature

## What Changed?

### Files to Replace/Merge
```
frontend/src/components/admin/VisitorManager.jsx
→ Replace with VisitorManagerEnhanced.jsx OR merge changes

frontend/src/components/VisitorPage.jsx  
→ Replace with VisitorPageEnhanced.jsx OR merge changes

backend/server.py
→ Already updated with new endpoints and model
```

### What's New in Backend
1. **Model:** `PageRotationRequest` - holds page_ids and interval_ms
2. **Endpoints:**
   - `PUT /api/visitors/{id}/approve/rotate` - Start rotation
   - `PUT /api/visitors/{id}/rotation/next` - Skip page
   - `PUT /api/visitors/{id}/rotation/stop` - Stop rotation

### What's New in Frontend
1. **VisitorManager:** Mode toggle, page selector, interval control
2. **VisitorPage:** Auto-rotation, overlay display, event handlers

## Admin User Guide

### Approve Visitor (Single Page)
1. Click ✓ button on visitor
2. Modal opens → "SINGLE PAGE" already selected
3. Choose page from dropdown (or leave empty for default)
4. Click "APPROVE"

### Approve Visitor (Rotation)
1. Click ✓ button on visitor
2. Modal opens
3. Click "ROTATE (UP TO 6)" tab
4. Select 2-6 pages (checkboxes)
5. Set rotation speed (e.g., 5000ms = 5 seconds per page)
6. Click "START ROTATION"

### Control Active Rotation
- ⏩ **Skip to next page** - Jump ahead in rotation
- ⏸ **Stop rotation** - Freeze on current page and exit rotation mode
- 🔄 **Refresh** - Reload admin panel (rotation continues for visitor)

## Visitor User Guide

### Single Page Mode
- Screen shows page normally
- No rotation indicator
- Page stays until admin blocks or resets

### Rotation Mode
- First page displays
- Orange indicator at bottom shows:
  - Current page number (Page 2/4)
  - Rotation speed (5.0s cycle)
  - Pulsing dot indicating active rotation
- Pages auto-advance on schedule
- May receive "Next" command from admin (instant advance)
- May receive "Stop" command from admin (freeze page)

## API Quick Reference

### Start Rotation
```bash
curl -X PUT http://localhost:8000/api/visitors/visitor123/approve/rotate \
  -H "Content-Type: application/json" \
  -d '{
    "page_ids": ["page_a", "page_b", "page_c"],
    "interval_ms": 5000
  }'
```

### Skip to Next Page
```bash
curl -X PUT http://localhost:8000/api/visitors/visitor123/rotation/next
```

### Stop Rotation
```bash
curl -X PUT http://localhost:8000/api/visitors/visitor123/rotation/stop
```

## Testing Checklist

### Before Going Live
- [ ] npm start compiles without errors
- [ ] python server.py starts without errors
- [ ] Single-page approval still works
- [ ] Rotation mode starts with 2+ pages
- [ ] Pages advance automatically
- [ ] Overlay displays on visitor screen
- [ ] Manual skip button works
- [ ] Stop button works
- [ ] Rotation persists after disconnect

### After Deployment
- [ ] No console errors
- [ ] Admin can see rotation status
- [ ] Visitors receive rotation pages
- [ ] WebSocket connection stable
- [ ] Database updates reflect changes

## Troubleshooting

### Rotation won't start
- ✓ Selected at least 2 pages?
- ✓ All pages exist in database?
- ✓ Interval is between 1000-60000ms?

### Pages don't advance
- ✓ WebSocket connected?
- ✓ Try clicking manual "skip" button
- ✓ Check browser console for errors

### Overlay not visible
- ✓ Is `isRotating` true in component state?
- ✓ CSS not hidden by other styles?
- ✓ Check z-index (should be 10000)

### Rotation stops unexpectedly
- ✓ Did admin click "stop" button?
- ✓ Did visitor get blocked?
- ✓ Check server logs for errors

## Configuration

### Rotation Speed Options
- 1000ms (1.0s) - Very fast, noticeable transitions
- 3000ms (3.0s) - Fast, good for scanning
- 5000ms (5.0s) - Default, balanced
- 10000ms (10.0s) - Slow, time to read
- 30000ms (30.0s) - Very slow, detailed reading

### Page Limits
- Minimum: 2 pages required for rotation
- Maximum: 6 pages allowed
- Existing single-page approvals unaffected

## Key Differences from Original

| Aspect | Before | After |
|--------|--------|-------|
| Approve | Single page only | Single OR rotation mode |
| Pages per visitor | 1 | 1 to 6 |
| Control | Approve only | Approve, skip, stop |
| Visibility | Status unchanged | "ROTATING" indicator |
| Admin actions | Approve/block/delete | + skip/pause buttons |
| Visitor UI | Page displays | + rotation overlay |

## Files Delivered

✅ **Frontend Components:**
- `VisitorManagerEnhanced.jsx` - Admin interface with rotation
- `VisitorPageEnhanced.jsx` - Visitor page with auto-rotation

✅ **Backend:**
- `server.py` - Updated with 3 new endpoints

✅ **Documentation:**
- `IMPLEMENTATION_SUMMARY.md` - This overview
- `INSTALLATION_GUIDE.md` - Step-by-step integration
- `ROTATION_FEATURE_GUIDE.md` - Complete technical guide
- `backend_rotation_endpoints.py` - Reference code

## Getting Help

**For deployment issues:**
1. Check INSTALLATION_GUIDE.md
2. Review Troubleshooting section
3. Check server/browser console logs

**For feature details:**
1. Check ROTATION_FEATURE_GUIDE.md
2. Review API documentation
3. Check WebSocket event formats

**For code changes:**
1. Review implementation in Enhanced files
2. Compare with original components
3. Check diffs in changed sections

## Success Criteria ✓

Feature is working when:
1. ✅ Admin can select rotation mode
2. ✅ Admin can select 2-6 pages
3. ✅ Admin can set rotation speed
4. ✅ Rotation starts and pages advance
5. ✅ Visitor sees overlay with page info
6. ✅ Admin can skip pages manually
7. ✅ Admin can stop rotation
8. ✅ Rotation survives disconnect/reconnect
9. ✅ Old approvals still work
10. ✅ No errors in console

---

**Version:** 1.0  
**Status:** Ready for Integration  
**Created:** 2026-02-28
