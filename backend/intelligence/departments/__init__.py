"""
Department registry — the slug -> Department lookup mission_engine uses.
Research, Trading Intelligence, and Customer Discovery are implemented; the
remaining roster exists as `planned` ZamoDepartment rows (seeded via
intelligence/seed.py) with no registry entry yet.
"""
from __future__ import annotations

from intelligence.departments.base import Department
from intelligence.departments.customer_discovery import CustomerDiscoveryDepartment
from intelligence.departments.research import ResearchDepartment
from intelligence.departments.trading_intelligence import TradingIntelligenceDepartment

_REGISTRY: dict[str, Department] = {
    "research": ResearchDepartment(),
    "trading_intelligence": TradingIntelligenceDepartment(),
    "customer_discovery": CustomerDiscoveryDepartment(),
}


def get_department(slug: str) -> Department:
    try:
        return _REGISTRY[slug]
    except KeyError:
        raise ValueError(f"Unknown or not-yet-implemented department: {slug}") from None


def list_department_slugs() -> list[str]:
    return list(_REGISTRY.keys())
