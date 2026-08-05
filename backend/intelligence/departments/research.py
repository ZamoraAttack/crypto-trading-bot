"""
Research Department — reference implementation of the Department interface
(Ch6). Reduces uncertainty via market/competitive/technical/regulatory
research; Read-tier only (never proposes execute-tier actions itself —
Engineering executes, in a separate future mission, once one exists).
"""
from __future__ import annotations

from intelligence.contracts import DepartmentContract, DepartmentResult, MissionContext
from intelligence.departments.base import Department
from intelligence.reasoning import run_department_reasoning

CONTRACT = DepartmentContract(
    slug="research",
    name="Research Department",
    purpose=(
        "Reduces uncertainty through market analysis, competitive intelligence, "
        "technical research, regulatory investigation, and strategic inquiry."
    ),
    scope="Investigation and evidence-gathering — produces decision-ready findings, never executes changes.",
    accepted_inputs=["objective", "success_criteria", "constraints"],
    required_outputs=["decision-ready findings with traceable evidence"],
    decision_authority="read",
    approval_thresholds=(
        "Research recommendations are Read-tier and do not require approval; if a "
        "recommendation implies a write/execute action, that action belongs to a "
        "separate mission owned by the relevant department (e.g. Engineering)."
    ),
    success_measures=["evidence quality", "recommendation accuracy", "traceability"],
    knowledge_responsibilities=["Technical knowledge", "Market knowledge", "Decision knowledge"],
    internal_specialists=["research-analyst"],
)


class ResearchDepartment(Department):
    contract = CONTRACT

    async def execute_mission(self, context: MissionContext) -> DepartmentResult:
        return await run_department_reasoning(contract=self.contract, context=context)
