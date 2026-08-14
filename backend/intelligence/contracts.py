"""
Shared Executive Department contracts (Ch6) and Mission delegation context
(Ch5). Every department implements against these types — this is what lets
Customer Discovery and Relationship Management inherit the same architecture
instead of each getting a bespoke implementation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DepartmentContract:
    """Design-time contract (Ch6) — one instance per department, defined in
    code since it's tightly coupled to behavior (prompt, tools, authority).
    Runtime status is derived from ZamoMission at read time, never cached
    here (plan refinement 5)."""
    slug: str
    name: str
    purpose: str
    scope: str
    accepted_inputs: list[str]
    required_outputs: list[str]
    decision_authority: str  # "read" | "draft" | "execute"
    approval_thresholds: str
    success_measures: list[str]
    knowledge_responsibilities: list[str]
    cross_department_interfaces: list[str] = field(default_factory=list)
    internal_specialists: list[str] = field(default_factory=lambda: ["default"])


@dataclass
class MissionContext:
    """Everything a department needs per Ch5 Delegation — context is part of
    the mission, not optional background."""
    mission_id: str
    objective: str
    success_criteria: str | None
    evidence_justification: str | None
    constraints: dict[str, Any]
    authority_granted: str
    organizational_history: list[dict[str, Any]] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)
    expected_deliverables: str | None = None


@dataclass
class ObservationDraft:
    """What a department produces mid-mission, before persistence —
    mission_engine writes the actual ZamoObservation rows."""
    source_type: str
    extracted_evidence: str
    source_reference: str | None = None
    relevance: float | None = None
    impact: float | None = None
    urgency: float | None = None
    novelty: float | None = None
    persistence: float | None = None
    sensitivity_classification: str | None = None


@dataclass
class RecommendationDraft:
    summary: str
    reasoning: str
    action_recommended: str
    evidence: list[dict[str, Any]]
    confidence: float
    alternatives_considered: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
    uncertainty: str | None = None
    action_tier: str = "read"  # "read" | "draft" | "execute" — drives requires_approval


@dataclass
class KnowledgeContribution:
    key: str  # local identifier within one DepartmentResult, for graph linking
    category: str  # Ch4 taxonomy value
    title: str
    content: str
    tags: list[str] = field(default_factory=list)
    confidence: float | None = None
    relates_to_key: str | None = None
    relationship_type: str | None = None  # e.g. "supported_by"


@dataclass
class DepartmentResult:
    """What Department.execute_mission() returns to mission_engine."""
    observations: list[ObservationDraft]
    recommendation: RecommendationDraft
    what_happened: str
    what_changed: str | None = None
    lessons: str | None = None
    knowledge_contributions: list[KnowledgeContribution] = field(default_factory=list)
    # Token usage for the reasoning pass that produced this result — set by
    # run_department_reasoning() (Ch3), read by mission_engine to record a
    # per-mission cost estimate. 0 for anything that doesn't call Claude.
    input_tokens: int = 0
    output_tokens: int = 0
