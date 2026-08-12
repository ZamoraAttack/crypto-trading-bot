"""
One-time seed for the ZamoDepartment roster (Ch6) — safe to call on every
startup (idempotent upsert, `ON CONFLICT DO NOTHING`). Payroll is deliberately
excluded: per the founder's decision, it's a future business/client of ZAMO,
not a department (Ch2 diagram vs Ch6 roster inconsistency — resolved in
favor of Ch6, the chapter that actually defines departments).
"""
from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert

from database import AsyncSessionLocal, ZamoDepartment

_ROSTER = [
    ("research", "Research Department", "active"),
    ("trading_intelligence", "Trading Intelligence Department", "active"),
    ("marketing", "Marketing Department", "planned"),
    ("finance", "Finance Department", "planned"),
    ("operations", "Operations Department", "planned"),
    ("relationship_management", "Relationship Management Department", "planned"),
    ("customer_discovery", "Customer Discovery Department", "planned"),
    ("engineering", "Engineering Department", "planned"),
]


async def seed_departments() -> None:
    async with AsyncSessionLocal() as db:
        for slug, name, status in _ROSTER:
            stmt = pg_insert(ZamoDepartment).values(slug=slug, name=name, status=status)
            stmt = stmt.on_conflict_do_nothing(index_elements=["slug"])
            await db.execute(stmt)
        await db.commit()
