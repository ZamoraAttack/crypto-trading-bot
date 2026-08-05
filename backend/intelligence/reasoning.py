"""
Reasoning Engine (Ch3) — shared Anthropic SDK plumbing every department
reuses. Uses a manual tool-use loop rather than the beta Tool Runner: this
module needs a precisely validated nested JSON schema (enums, required
fields) for the result-submission tool, which the Tool Runner's
decorator-based schema inference isn't guaranteed to produce faithfully for
nested list[dict] parameters. The hosted web_search tool is declared exactly
as the existing TS assistant route already does on the Next.js side (same
tool type, no client-side run function needed) — proven pattern in this
codebase, ported here.
"""
from __future__ import annotations

import json
import logging

import anthropic

from intelligence.contracts import (
    DepartmentContract,
    DepartmentResult,
    KnowledgeContribution,
    MissionContext,
    ObservationDraft,
    RecommendationDraft,
)

log = logging.getLogger("zamo.reasoning")

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic()  # reads ANTHROPIC_API_KEY from env
    return _client


_MODEL = "claude-opus-5"
_MAX_TOOL_TURNS = 12  # bounded loop — never spin forever on a stuck mission
_RESULT_TOOL_NAME = "submit_department_result"

_RESULT_TOOL = {
    "name": _RESULT_TOOL_NAME,
    "description": (
        "Submit the department's final mission result: observations gathered, "
        "the evidence-linked recommendation, and knowledge worth preserving. "
        "Call this exactly once, after you have real evidence to cite."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "observations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "source_type": {"type": "string"},
                        "source_reference": {"type": "string"},
                        "extracted_evidence": {
                            "type": "string",
                            "description": "The distilled finding — not a raw dump of the source.",
                        },
                        "relevance": {"type": "number"},
                        "impact": {"type": "number"},
                        "urgency": {"type": "number"},
                        "novelty": {"type": "number"},
                        "persistence": {"type": "number"},
                    },
                    "required": ["source_type", "extracted_evidence"],
                },
            },
            "recommendation": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "What is happening."},
                    "reasoning": {"type": "string", "description": "Why it matters."},
                    "action_recommended": {"type": "string", "description": "What to do."},
                    "evidence": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "observation_index": {
                                    "type": "integer",
                                    "description": "Index into the observations array above.",
                                },
                                "note": {"type": "string"},
                            },
                            "required": ["observation_index"],
                        },
                    },
                    "confidence": {"type": "number", "description": "0 to 1."},
                    "alternatives_considered": {"type": "array", "items": {"type": "string"}},
                    "assumptions": {"type": "array", "items": {"type": "string"}},
                    "uncertainty": {"type": "string"},
                    "action_tier": {"type": "string", "enum": ["read", "draft", "execute"]},
                },
                "required": [
                    "summary", "reasoning", "action_recommended",
                    "evidence", "confidence", "action_tier",
                ],
            },
            "what_happened": {"type": "string"},
            "what_changed": {"type": "string"},
            "lessons": {"type": "string"},
            "knowledge_contributions": {
                "type": "array",
                "minItems": 1,
                "description": "At least one durable finding worth preserving beyond this mission — required, not optional decoration.",
                "items": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "Local identifier for linking within this result."},
                        "category": {
                            "type": "string",
                            "enum": [
                                "strategic", "operational", "relationship", "financial",
                                "technical", "market", "experimental", "decision",
                            ],
                        },
                        "title": {"type": "string"},
                        "content": {"type": "string"},
                        "tags": {"type": "array", "items": {"type": "string"}},
                        "confidence": {"type": "number"},
                        "relates_to_key": {"type": "string"},
                        "relationship_type": {"type": "string", "description": 'e.g. "supported_by".'},
                    },
                    "required": ["key", "category", "title", "content"],
                },
            },
        },
        "required": ["observations", "recommendation", "what_happened", "knowledge_contributions"],
    },
}

_WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search"}


def _build_system_prompt(contract: DepartmentContract, context: MissionContext) -> str:
    return f"""You are the {contract.name} for ZAMO, Alan's Executive Operating System.

Purpose: {contract.purpose}
Scope: {contract.scope}
Decision authority: {contract.decision_authority} — you may only recommend or draft; you never execute directly. If your recommendation implies a write/execute-tier action, set action_tier accordingly rather than performing it yourself.
Required outputs: {", ".join(contract.required_outputs)}

Mission objective: {context.objective}
Success criteria: {context.success_criteria or "Not specified."}
Constraints: {json.dumps(context.constraints)}

Ch3 principle: every recommendation must answer "what is happening", "why does it matter", and "what should we do", with evidence traceable to specific observations you gather. Confidence must be proportional to evidence — do not report high confidence without support.
Ch4 principle: extracted_evidence should be the distilled finding, not a raw dump of a source's full content.

Ch4 principle, knowledge_contributions is not optional decoration — it is how this mission's work outlives the mission. An empty knowledge_contributions array means this work will be unfindable later, even though you did it. Before calling {_RESULT_TOOL_NAME}, convert what you learned into at least one durable entry: if you reached a real conclusion or recommendation, capture it as a "decision" entry (the choice, its evidence, its confidence); if you learned reusable facts about how something works, capture those separately as the relevant category (e.g. "technical", "market"). When a decision entry rests on a specific factual finding, link them with relates_to_key/relationship_type (e.g. "supported_by") so the connection is preserved, not just the two facts in isolation. Leave knowledge_contributions empty only if the mission genuinely produced nothing worth remembering — that should be rare.

When you have gathered enough evidence, call {_RESULT_TOOL_NAME} exactly once with your complete result. Do not call it before you have real evidence to cite."""


async def run_department_reasoning(
    *, contract: DepartmentContract, context: MissionContext,
) -> DepartmentResult:
    """Runs one department's reasoning pass to completion and returns a
    structured DepartmentResult. Shared by every department — the piece that
    makes Research a true reference implementation rather than a one-off."""
    client = _get_client()
    system = _build_system_prompt(contract, context)
    tools = [_WEB_SEARCH_TOOL, _RESULT_TOOL]
    messages: list[dict] = [{"role": "user", "content": f"Begin the mission: {context.objective}"}]

    for _ in range(_MAX_TOOL_TURNS):
        response = await client.messages.create(
            model=_MODEL, max_tokens=8192, system=system, tools=tools,
            messages=messages, output_config={"effort": "high"},
        )

        if response.stop_reason == "refusal":
            category = getattr(response.stop_details, "category", None) if response.stop_details else None
            raise RuntimeError(f"Department reasoning was refused (category={category})")

        result_block = next(
            (b for b in response.content if getattr(b, "type", None) == "tool_use" and b.name == _RESULT_TOOL_NAME),
            None,
        )
        if result_block:
            # minItems in the schema is only a hint to the model, not a
            # server-enforced constraint — verify in code rather than trust
            # it, since an empty knowledge_contributions array means this
            # mission's work would be silently unfindable later (Ch4).
            if not result_block.input.get("knowledge_contributions"):
                messages.append({"role": "assistant", "content": response.content})
                messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": result_block.id,
                        "content": (
                            "knowledge_contributions was empty. You must include at least one durable "
                            "finding (a decision, technical fact, or market insight) before this mission "
                            "can complete. Call submit_department_result again with a non-empty "
                            "knowledge_contributions array."
                        ),
                        "is_error": True,
                    }],
                })
                continue
            return _parse_result(result_block.input)

        if response.stop_reason == "pause_turn":
            # Server-side tool (web_search) hit its internal iteration limit —
            # resume by re-sending the same turn per documented guidance. Do
            # NOT add a synthetic "Continue" message; the API detects the
            # trailing server_tool_use block and resumes automatically.
            messages = [messages[0], {"role": "assistant", "content": response.content}]
            continue

        if response.stop_reason == "tool_use":
            # The only client-side tool declared is the result tool, already
            # checked above — reaching here means an unexpected tool call.
            names = [b.name for b in response.content if getattr(b, "type", None) == "tool_use"]
            raise RuntimeError(f"Department reasoning requested an unexpected tool call: {names}")

        # end_turn (or similar) without submitting a result yet — nudge and continue.
        messages.append({"role": "assistant", "content": response.content})
        messages.append({
            "role": "user",
            "content": f"Continue gathering evidence, then call {_RESULT_TOOL_NAME} with your complete result.",
        })

    raise RuntimeError("Department reasoning exceeded its tool-use step budget without a result")


def _parse_result(raw: dict) -> DepartmentResult:
    observations = [
        ObservationDraft(
            source_type=o.get("source_type", "unknown"),
            extracted_evidence=o.get("extracted_evidence", ""),
            source_reference=o.get("source_reference"),
            relevance=o.get("relevance"), impact=o.get("impact"), urgency=o.get("urgency"),
            novelty=o.get("novelty"), persistence=o.get("persistence"),
        )
        for o in raw.get("observations", [])
    ]
    rec = raw["recommendation"]
    recommendation = RecommendationDraft(
        summary=rec["summary"], reasoning=rec["reasoning"], action_recommended=rec["action_recommended"],
        evidence=rec.get("evidence", []), confidence=float(rec.get("confidence", 0.5)),
        alternatives_considered=rec.get("alternatives_considered", []),
        assumptions=rec.get("assumptions", []), uncertainty=rec.get("uncertainty"),
        action_tier=rec.get("action_tier", "read"),
    )
    knowledge_contributions = [
        KnowledgeContribution(
            key=k["key"], category=k["category"], title=k["title"], content=k["content"],
            tags=k.get("tags", []), confidence=k.get("confidence"),
            relates_to_key=k.get("relates_to_key"), relationship_type=k.get("relationship_type"),
        )
        for k in raw.get("knowledge_contributions", [])
    ]
    return DepartmentResult(
        observations=observations, recommendation=recommendation,
        what_happened=raw.get("what_happened", ""), what_changed=raw.get("what_changed") or None,
        lessons=raw.get("lessons") or None, knowledge_contributions=knowledge_contributions,
    )
