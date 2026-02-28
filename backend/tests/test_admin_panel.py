"""Backend tests for Admin Panel v2.1 - Pentest Control"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ── Auth ──────────────────────────────────────────────────────────────────────
class TestAuth:
    def test_admin_login_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/admin", json={"password": "University@007"})
        assert r.status_code == 200
        assert r.json().get("success") is True

    def test_admin_login_fail(self):
        r = requests.post(f"{BASE_URL}/api/auth/admin", json={"password": "wrong"})
        assert r.status_code == 401

# ── Stats ─────────────────────────────────────────────────────────────────────
class TestStats:
    def test_get_stats(self):
        r = requests.get(f"{BASE_URL}/api/stats")
        assert r.status_code == 200
        d = r.json()
        assert "visitors" in d
        assert "pentest" in d
        assert "alerts" in d
        assert "total" in d["visitors"]
        assert "pending" in d["visitors"]

# ── Visitors ──────────────────────────────────────────────────────────────────
class TestVisitors:
    def test_register_visitor(self):
        sid = str(uuid.uuid4())
        r = requests.post(f"{BASE_URL}/api/visitors/register", json={
            "session_id": sid,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0) Test Browser",
            "screen_width": 1920, "screen_height": 1080,
            "timezone": "UTC", "languages": "en"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["session_id"] == sid
        assert d["status"] == "pending"
        assert "id" in d
        return d["id"], sid

    def test_register_bot_visitor(self):
        sid = str(uuid.uuid4())
        r = requests.post(f"{BASE_URL}/api/visitors/register", json={
            "session_id": sid,
            "user_agent": "python-requests/2.28.0",
            "screen_width": 0, "screen_height": 0,
            "timezone": "", "languages": ""
        })
        assert r.status_code == 200
        d = r.json()
        assert d["is_bot"] is True

    def test_get_visitors(self):
        r = requests.get(f"{BASE_URL}/api/visitors")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_visitor_status(self):
        sid = str(uuid.uuid4())
        requests.post(f"{BASE_URL}/api/visitors/register", json={
            "session_id": sid,
            "user_agent": "Mozilla/5.0 Status Test",
            "screen_width": 1280, "screen_height": 720,
            "timezone": "UTC", "languages": "en"
        })
        r = requests.get(f"{BASE_URL}/api/visitors/{sid}/status")
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_approve_visitor(self):
        sid = str(uuid.uuid4())
        reg = requests.post(f"{BASE_URL}/api/visitors/register", json={
            "session_id": sid,
            "user_agent": "Mozilla/5.0 Approve Test",
            "screen_width": 1280, "screen_height": 720,
            "timezone": "UTC", "languages": "en"
        })
        vid = reg.json()["id"]
        r = requests.put(f"{BASE_URL}/api/visitors/{vid}/approve", json={})
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_block_visitor(self):
        sid = str(uuid.uuid4())
        reg = requests.post(f"{BASE_URL}/api/visitors/register", json={
            "session_id": sid,
            "user_agent": "Mozilla/5.0 Block Test",
            "screen_width": 1280, "screen_height": 720,
            "timezone": "UTC", "languages": "en"
        })
        vid = reg.json()["id"]
        r = requests.put(f"{BASE_URL}/api/visitors/{vid}/block")
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_delete_visitor(self):
        sid = str(uuid.uuid4())
        reg = requests.post(f"{BASE_URL}/api/visitors/register", json={
            "session_id": sid,
            "user_agent": "Mozilla/5.0 Delete Test",
            "screen_width": 1280, "screen_height": 720,
            "timezone": "UTC", "languages": "en"
        })
        vid = reg.json()["id"]
        r = requests.delete(f"{BASE_URL}/api/visitors/{vid}")
        assert r.status_code == 200

# ── Pages ─────────────────────────────────────────────────────────────────────
class TestPages:
    def test_get_pages(self):
        r = requests.get(f"{BASE_URL}/api/pages")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_page(self):
        r = requests.post(f"{BASE_URL}/api/pages", json={
            "name": "TEST_Page",
            "content": "<html><body>Test Content</body></html>",
            "is_default": False
        })
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_Page"
        assert "id" in d
        return d["id"]

    def test_create_default_page(self):
        r = requests.post(f"{BASE_URL}/api/pages", json={
            "name": "TEST_Default_Page",
            "content": "<html><body>Default</body></html>",
            "is_default": True
        })
        assert r.status_code == 200
        d = r.json()
        assert d["is_default"] is True

    def test_get_default_page(self):
        r = requests.get(f"{BASE_URL}/api/pages/default")
        assert r.status_code == 200

    def test_delete_page(self):
        r = requests.post(f"{BASE_URL}/api/pages", json={
            "name": "TEST_DeletePage",
            "content": "<html></html>",
            "is_default": False
        })
        pid = r.json()["id"]
        del_r = requests.delete(f"{BASE_URL}/api/pages/{pid}")
        assert del_r.status_code == 200

# ── Targets ───────────────────────────────────────────────────────────────────
class TestPentest:
    def test_get_targets(self):
        r = requests.get(f"{BASE_URL}/api/targets")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_target(self):
        r = requests.post(f"{BASE_URL}/api/targets", json={
            "host": "TEST_192.168.1.100",
            "description": "Test target",
            "ports": "80,443,8080",
            "status": "active"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["host"] == "TEST_192.168.1.100"
        return d["id"]

    def test_create_scan(self):
        # Create target first
        t = requests.post(f"{BASE_URL}/api/targets", json={
            "host": "TEST_scan_target.com",
            "description": "Scan test", "ports": "80", "status": "active"
        })
        tid = t.json()["id"]
        r = requests.post(f"{BASE_URL}/api/scans", json={
            "target_id": tid,
            "scan_type": "nmap",
            "results": "Port 80 open",
            "notes": "Test scan",
            "status": "completed"
        })
        assert r.status_code == 200
        assert r.json()["scan_type"] == "nmap"

    def test_create_vulnerability(self):
        t = requests.post(f"{BASE_URL}/api/targets", json={
            "host": "TEST_vuln_target.com",
            "description": "Vuln test", "ports": "443", "status": "active"
        })
        tid = t.json()["id"]
        r = requests.post(f"{BASE_URL}/api/vulnerabilities", json={
            "target_id": tid,
            "title": "TEST_SQL Injection",
            "severity": "critical",
            "description": "Test vuln",
            "cvss": 9.8,
            "status": "open"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "TEST_SQL Injection"
        assert d["severity"] == "critical"

    def test_delete_target(self):
        t = requests.post(f"{BASE_URL}/api/targets", json={
            "host": "TEST_delete_me.com",
            "description": "", "ports": "", "status": "active"
        })
        tid = t.json()["id"]
        r = requests.delete(f"{BASE_URL}/api/targets/{tid}")
        assert r.status_code == 200

# ── Alerts ────────────────────────────────────────────────────────────────────
class TestAlerts:
    def test_get_alerts(self):
        r = requests.get(f"{BASE_URL}/api/alerts")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_alert(self):
        r = requests.post(f"{BASE_URL}/api/alerts", json={
            "type": "system",
            "message": "TEST_Alert message",
            "severity": "info"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["message"] == "TEST_Alert message"
        assert d["read"] is False

    def test_mark_alert_read(self):
        r = requests.post(f"{BASE_URL}/api/alerts", json={
            "type": "system", "message": "TEST_Read alert", "severity": "info"
        })
        aid = r.json()["id"]
        rr = requests.put(f"{BASE_URL}/api/alerts/{aid}/read")
        assert rr.status_code == 200

    def test_mark_all_read(self):
        r = requests.put(f"{BASE_URL}/api/alerts/read-all")
        assert r.status_code == 200

    def test_telegram_test(self):
        # This may succeed (returns 200) even without token configured
        r = requests.get(f"{BASE_URL}/api/telegram/test")
        assert r.status_code == 200
