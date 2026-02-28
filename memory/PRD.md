# PRD — Live Admin Panel v2.1 (Pentest Control)

## Original Problem Statement
Build a Live Admin Panel v2.1 - Pentest Control app. Features: visitor tracking/monitoring, pentest control panel, admin dashboard, anti-bot detection, admin-controlled visitor page approval, page builder/uploader, real-time WebSocket updates, Telegram notifications.
- Admin password: `University@007`
- Tech: React + FastAPI + MongoDB + WebSockets
- Telegram notifications (token/chat ID to be added later)

## Architecture
- **Frontend**: React.js, JetBrains Mono font, dark hacker theme (#0a0a0a bg, #00ff88 accent)
- **Backend**: FastAPI, MongoDB (motor), httpx for Telegram
- **Real-time**: Native FastAPI WebSockets (/api/ws/admin, /api/ws/visitor/{session_id})
- **IP Geolocation**: ip-api.com (free, no key)
- **Telegram**: httpx direct API calls (add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to backend/.env)

## Core Requirements (Static)
1. Visitor loading/pending page shown at `/` until admin approves
2. Admin panel at `/admin` (password: University@007)
3. Visitor tracking: IP, geolocation, user-agent, screen, timezone
4. Anti-bot detection: UA string pattern matching
5. Admin can approve/block individual visitors
6. Admin assigns a page to approved visitors (or uses default)
7. Page manager: create/edit/upload HTML pages, set default
8. Pentest panel: targets, scans, vulnerabilities
9. Alerts system with severity levels
10. Telegram notifications for new visitors, approvals, blocks, vulns

## What's Been Implemented (2025-02-28)

### Backend (/app/backend/server.py)
- Admin auth: `POST /api/auth/admin`
- Visitor endpoints: register, list, approve, block, delete, status
- Page endpoints: CRUD + default page
- Target/Scan/Vulnerability CRUD
- Alert system (auto-created + manual)
- Stats endpoint
- WebSocket manager (admin broadcast + visitor notify)
- Bot detection (UA pattern matching)
- IP geolocation via ip-api.com
- Telegram notifications via httpx
- Default page seeded on startup

### Frontend (/app/frontend/src)
- `VisitorPage.jsx` - Terminal-style loading screen; switches to iframe on approval
- `AdminPanel.jsx` - Password gate + sidebar layout + WebSocket live updates
- `Dashboard.jsx` - Stats cards, recent visitors, bot detection, live events, alerts
- `VisitorManager.jsx` - Full visitor table with approve/block/delete + page assignment
- `PageManager.jsx` - Page CRUD with HTML editor + file upload + preview
- `PentestPanel.jsx` - Targets/Scans/Vulnerabilities management
- `AlertsPanel.jsx` - Alerts with filters, mark read, Telegram test

## Environment Variables
```
# backend/.env
MONGO_URL=mongodb://localhost:27017
DB_NAME=admin_panel_db
ADMIN_PASSWORD=University@007
TELEGRAM_BOT_TOKEN=   # Add your token from @BotFather
TELEGRAM_CHAT_ID=     # Add your chat ID
```

## Prioritized Backlog
### P0 (Critical)
- Add Telegram bot token & chat ID to backend/.env

### P1 (High)
- API-level authentication (currently only frontend password gate; REST endpoints unprotected)
- Rate limiting on visitor registration to prevent abuse

### P2 (Nice to have)
- Real-time geolocation map visualization
- Advanced bot detection (JS fingerprinting, headless browser detection)
- Export visitor/vulnerability reports to CSV/PDF
- CAPTCHA challenge for suspicious visitors
- Scan result diff/comparison
- Session timeout for admin

## Next Tasks
1. User to add Telegram credentials to `/app/backend/.env`
2. Consider adding API auth middleware for production use
3. Optional: add more sophisticated bot detection (canvas fingerprinting, timing analysis)
