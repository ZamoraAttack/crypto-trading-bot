"""
Trading Intelligence Department — Phase 1 pilot (observation mode only).

Validates the architectural goal behind this milestone: that Executive
Intelligence can observe an existing production system (the Polymarket
copy-trading bot) and accumulate real knowledge about it without any
execution coupling. Read-tier only, always. The bot itself makes no
strategic entry decision — it mechanically mirrors a followed wallet within
fixed sizing rules — so this department's job is to independently assess the
followed trader's signal quality, not to reverse-engineer a bot decision
that doesn't exist.

Reuses run_department_reasoning() unchanged: the batch of resolved trade
observations (intelligence/trading_data.py, zero-Claude) is embedded into
the mission's constraints by the digest runner before the mission is
created, so this department needs no bespoke reasoning wiring.
"""
from __future__ import annotations

from intelligence.contracts import DepartmentContract, DepartmentResult, MissionContext
from intelligence.departments.base import Department
from intelligence.reasoning import run_department_reasoning

CONTRACT = DepartmentContract(
    slug="trading_intelligence",
    name="Trading Intelligence Department",
    purpose=(
        "Observes the Polymarket copy-trading bot's resolved trades and evaluates "
        "whether the followed trader's signal was sound, given market context, "
        "timing, risk, and the eventual outcome."
    ),
    scope=(
        "Advisory analysis of already-executed, already-resolved trades, delivered as "
        "periodic batched digests — never a reasoning pass per trade. Never modifies, "
        "delays, or blocks a trade; never changes wallet selection or position sizing; "
        "has no execution or pre-trade recommendation authority in this milestone. "
        "Knowledge discipline: most digests should find nothing genuinely new. Write a "
        "pattern-level knowledge_contributions entry beyond the required digest coverage "
        "entry only when something is truly surprising, a pattern repeats across several "
        "trades, a wallet's edge appears to be improving or degrading, or a real belief "
        "gets contradicted — not by default just because one contribution is required."
    ),
    accepted_inputs=["trade_batch (pre-fetched, resolved Polymarket positions)", "wallet_scope", "window"],
    required_outputs=[
        "digest-level findings with trade-level evidence",
        "outcome calibration against prior assumptions",
    ],
    decision_authority="read",
    approval_thresholds=(
        "Trading Intelligence recommendations are Read-tier and never require approval "
        "in this milestone — there is no execute-tier action this department can propose. "
        "Pre-trade recommendations and any decision authority are out of scope until a "
        "future milestone the founder has not yet approved."
    ),
    success_measures=[
        "outcome calibration accuracy (did stated confidence track real results)",
        "signal-to-noise of saved knowledge (no near-duplicate objects per digest)",
        "zero measurable effect on bot execution behavior",
    ],
    knowledge_responsibilities=["market", "decision", "operational"],
    internal_specialists=["trading-analyst"],
)


class TradingIntelligenceDepartment(Department):
    contract = CONTRACT

    async def execute_mission(self, context: MissionContext) -> DepartmentResult:
        return await run_department_reasoning(contract=self.contract, context=context)
