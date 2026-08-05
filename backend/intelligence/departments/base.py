"""
Department interface (Ch6) — every Executive Department implements this.
The operating system manages departments through this interface rather than
per-department special-casing, so Customer Discovery and Relationship
Management can be added later without changing mission_engine.py.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from intelligence.contracts import DepartmentContract, DepartmentResult, MissionContext


class Department(ABC):
    contract: DepartmentContract

    @abstractmethod
    async def execute_mission(self, context: MissionContext) -> DepartmentResult:
        """Run this department's reasoning for one mission and return a
        structured result. Departments never write to the database directly —
        mission_engine owns persistence so every department's evidence trail,
        approval tiering, and knowledge contribution are handled uniformly."""
        raise NotImplementedError
