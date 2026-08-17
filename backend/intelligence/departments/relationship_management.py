"""
Relationship Management Department — third and final department in the
original immediate roster (Research -> Customer Discovery -> Relationship
Management). Turns discovered prospects/relationships into thoughtful,
founder-led sales activity: who to contact, why, what's known about them,
what stage the relationship is in, and what the next action should be.

Reuses run_department_reasoning() unchanged, per the founder's directive that
every department inherits contracts.py/reasoning.py rather than getting
bespoke reasoning wiring — Research and Customer Discovery proved the
pattern, this is the third proof point.

Deliberately narrow for Phase 4 (Executive Intelligence): this department
observes, reasons, recommends, and remembers. It never contacts a prospect
directly, sends a message, or runs a follow-up sequence — those are Execute-
tier actions that belong to a later phase, after the founder has run the real
sales process manually and learned what's actually worth automating. The
reasoning engine only gives this department read tools (web_search) and a
result-submission tool, so it is structurally incapable of sending anything,
independent of the prompt.
"""
from __future__ import annotations

from intelligence.contracts import DepartmentContract, DepartmentResult, MissionContext
from intelligence.departments.base import Department
from intelligence.reasoning import run_department_reasoning

CONTRACT = DepartmentContract(
    slug="relationship_management",
    name="Relationship Management Department",
    purpose=(
        "Turns discovered prospects and relationships into thoughtful, founder-led "
        "sales activity — assessing who is worth contacting, why, what stage the "
        "relationship is in, and what the next action should be."
    ),
    scope=(
        "Relationship and sales reasoning — prospect prioritization, synthesis of "
        "what is known about a company/person (including prior Research and "
        "Customer Discovery knowledge supplied via mission constraints), "
        "relationship-stage assessment, outreach-angle recommendation grounded in "
        "available evidence, and follow-up guidance based on objections, needs, or "
        "signals already observed. Produces decision-ready guidance for the "
        "founder to act on personally. Never contacts a prospect directly, never "
        "sends a message on the founder's behalf, and never runs an automated "
        "outreach or follow-up sequence — actual outreach execution and CRM "
        "automation belong to a later phase, after the real sales process has "
        "been learned manually."
    ),
    accepted_inputs=["objective", "success_criteria", "constraints"],
    required_outputs=[
        "decision-ready relationship/sales recommendation with traceable evidence "
        "and a founder-actionable next step"
    ],
    decision_authority="draft",
    approval_thresholds=(
        "Relationship Management recommendations are typically Draft-tier, since "
        "they usually propose an outreach angle or next action for a real "
        "prospect that the founder must review before anything happens; a "
        "recommendation that is pure internal analysis with no proposed outreach "
        "(e.g. a relationship-stage assessment) may be Read-tier instead. No "
        "recommendation from this department is ever Execute-tier — this "
        "department cannot contact anyone, only recommend that the founder do so."
    ),
    success_measures=[
        "evidence quality", "relationship-stage accuracy", "actionability of the recommended next step"
    ],
    knowledge_responsibilities=["Relationship knowledge", "Decision knowledge"],
    internal_specialists=["relationship-management-analyst"],
)


class RelationshipManagementDepartment(Department):
    contract = CONTRACT

    async def execute_mission(self, context: MissionContext) -> DepartmentResult:
        return await run_department_reasoning(contract=self.contract, context=context)
