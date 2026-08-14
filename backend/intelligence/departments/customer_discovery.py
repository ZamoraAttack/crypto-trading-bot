"""
Customer Discovery Department — second general-purpose department alongside
Research (Ch6 roster). Investigates who the target customer is, what problem
they urgently need solved, how they solve it today, and what would make them
switch — turning assumptions about the customer into evidence before the
payroll MVP (or any future venture) is built around a guess.

Reuses run_department_reasoning() unchanged, per the founder's directive that
future departments inherit contracts.py/reasoning.py rather than each getting
bespoke reasoning wiring — Research proved the pattern, this is the second
proof point.
"""
from __future__ import annotations

from intelligence.contracts import DepartmentContract, DepartmentResult, MissionContext
from intelligence.departments.base import Department
from intelligence.reasoning import run_department_reasoning

CONTRACT = DepartmentContract(
    slug="customer_discovery",
    name="Customer Discovery Department",
    purpose=(
        "Investigates who the target customer is, what problem they urgently need "
        "solved, how they currently solve it, and what would make them switch — "
        "turning assumptions about the customer into evidence."
    ),
    scope=(
        "Customer-facing discovery and validation — market segment and pain-point "
        "research, competitor customer-experience analysis, willingness-to-pay "
        "signals, synthesis of any existing interview/conversation notes supplied "
        "in mission constraints. Produces decision-ready customer insight, never "
        "executes changes and never contacts customers directly — direct customer "
        "outreach belongs to the Relationship Management department once it exists."
    ),
    accepted_inputs=["objective", "success_criteria", "constraints"],
    required_outputs=["decision-ready customer insight with traceable evidence"],
    decision_authority="read",
    approval_thresholds=(
        "Customer Discovery recommendations are Read-tier and do not require "
        "approval; if a recommendation implies a write/execute action (e.g. "
        "reaching out to a prospect), that action belongs to a separate mission "
        "owned by the relevant department (e.g. Relationship Management)."
    ),
    success_measures=["evidence quality", "customer-need clarity", "traceability"],
    knowledge_responsibilities=["Relationship knowledge", "Market knowledge", "Decision knowledge"],
    internal_specialists=["customer-discovery-analyst"],
)


class CustomerDiscoveryDepartment(Department):
    contract = CONTRACT

    async def execute_mission(self, context: MissionContext) -> DepartmentResult:
        return await run_department_reasoning(contract=self.contract, context=context)
