"""
Trading Intelligence — manual digest runner (Phase 1 pilot).

Deliberately NOT wired to a scheduler. Cost/frequency control for this
milestone is "a human runs this," not a rate limiter — the strongest
possible guardrail against unattended recurring Claude spend. Run it
by hand:

    python scripts/run_trading_intelligence_digest.py [--wallet NAME]
        [--limit N] [--since YYYY-MM-DD] [--dry-run]

--dry-run prints the batch that would be analyzed without creating a
mission or calling Claude, useful for sanity-checking scope/volume first.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from database import AsyncSessionLocal, ZamoMission  # noqa: E402
from intelligence.mission_engine import create_mission, run_mission  # noqa: E402
from intelligence.trading_data import (  # noqa: E402
    RELIABLE_DATA_CUTOFF,
    fetch_trade_observations,
    top_wallet_by_resolved_volume,
)

MIN_BATCH_SIZE = 3       # below this, there's nothing real to say — refuse rather than force it
DEFAULT_BATCH_CAP = 15   # keeps prompt size and reasoning scope bounded
DUPLICATE_GUARD_HOURS = 24


async def _recent_digest_exists(wallet: str) -> bool:
    """Refuse to create a second digest for the same wallet within the guard
    window — a manual runner is still capable of being fat-fingered twice."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=DUPLICATE_GUARD_HOURS)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(ZamoMission).where(
                ZamoMission.department_slug == "trading_intelligence",
                ZamoMission.created_at >= cutoff,
            )
        )).scalars().all()
    return any((m.constraints or {}).get("wallet_scope") == wallet for m in rows)


def _build_objective(wallet: str, batch: list[dict], window_start: datetime) -> str:
    return (
        f"Produce a Trading Intelligence digest for followed trader '{wallet}', covering "
        f"{len(batch)} resolved Polymarket position(s) since {window_start.date().isoformat()}. "
        "The full trade batch is provided in constraints.trade_batch — do not use web_search "
        "to rediscover this bot's own trade history, only to gather external context (e.g. "
        "market/event facts, the wallet's public reputation if discoverable) relevant to "
        "evaluating the trades already given.\n\n"
        "The bot mechanically copies this wallet's trades within fixed sizing rules — it makes "
        "no strategic entry decision of its own. Evaluate whether the followed trader's signal "
        "was sound: signal quality, timing/entry price, risk factors, and what the eventual "
        "outcome (already included per trade) teaches us. Compare across the batch for repeated "
        "patterns or a wallet edge that may be improving or degrading.\n\n"
        "Your recommendation must be Read-tier and purely advisory — do not recommend any "
        "action the bot or founder should take beyond continued observation; this milestone "
        "has no pre-trade or execution authority.\n\n"
        "knowledge_contributions: always include exactly one lightweight 'operational' entry "
        "as the digest's coverage record (window, trades reviewed, one-line headline — even "
        "'no new pattern this window' is a valid headline). Add further entries only for "
        "genuinely new, non-duplicative findings — most digests should add nothing beyond the "
        "coverage record."
    )


async def run_digest(*, wallet: str | None, limit: int, since: datetime | None, dry_run: bool) -> None:
    since = since or RELIABLE_DATA_CUTOFF

    if wallet is None:
        wallet = await top_wallet_by_resolved_volume(since=since)
        if wallet is None:
            print(f"No resolved Polymarket trades found since {since.date().isoformat()}. Nothing to analyze.")
            return
        print(f"No --wallet given; auto-selected highest-volume trader: {wallet}")

    observations = await fetch_trade_observations(wallet=wallet, resolved_only=True, since=since, limit=limit)

    if len(observations) < MIN_BATCH_SIZE:
        print(
            f"Only {len(observations)} resolved trade(s) for '{wallet}' since {since.date().isoformat()} "
            f"— below the minimum batch size ({MIN_BATCH_SIZE}). Refusing to run a digest on too little "
            "signal. Try an earlier --since, a different --wallet, or wait for more resolved trades."
        )
        return

    approximate_count = sum(1 for o in observations if o.data_confidence == "approximate")
    print(f"Batch: {len(observations)} resolved trade(s) for '{wallet}' "
          f"({approximate_count} flagged approximate).")

    if dry_run:
        for o in observations:
            print(f"  {o.correlation_key}  entry={o.entry_price} size=${o.position_size_usd:.2f} "
                  f"-> {o.resolution} pnl=${o.pnl_usd}  [{o.data_confidence}]")
        print("(--dry-run: no mission created)")
        return

    if await _recent_digest_exists(wallet):
        print(f"A digest for '{wallet}' already ran within the last {DUPLICATE_GUARD_HOURS}h. Skipping.")
        return

    batch = [
        {**asdict(o), "entry_time": o.entry_time.isoformat(),
         "resolved_time": o.resolved_time.isoformat() if o.resolved_time else None}
        for o in observations
    ]
    window_start = min(o.entry_time for o in observations)
    window_end = max(o.resolved_time or o.entry_time for o in observations)

    mission = await create_mission(
        title=f"Trading Intelligence Digest — {wallet} — {datetime.now(timezone.utc).date().isoformat()}",
        objective=_build_objective(wallet, batch, since),
        department_slug="trading_intelligence",
        success_criteria=(
            "A digest covering coverage, findings, trade-level evidence (most relevant examples "
            "only, not every trade), outcome calibration, and at most a small number of durable "
            "knowledge entries."
        ),
        evidence_justification=f"{len(observations)} resolved Polymarket trades, pre-fetched read-only from `trades`.",
        constraints={
            "trade_batch": batch,
            "wallet_scope": wallet,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
            "batch_size": len(observations),
            "approximate_count": approximate_count,
        },
        authority_granted="read",
        created_by="founder",
    )
    print(f"Mission created: {mission.id} (state={mission.state}). Running...")

    await run_mission(mission.id)

    async with AsyncSessionLocal() as db:
        final = await db.get(ZamoMission, mission.id)
    print(f"Mission {mission.id} finished in state: {final.state}"
          + (f" — {final.blocked_reason}" if final.state == "blocked" else ""))
    print(f"Inspect via GET /api/zamo/missions/{mission.id}")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--wallet", default=None, help="Followed trader to scope the digest to (default: auto-select highest-volume)")
    p.add_argument("--limit", type=int, default=DEFAULT_BATCH_CAP, help=f"Max trades per digest (default {DEFAULT_BATCH_CAP})")
    p.add_argument("--since", default=None, help="YYYY-MM-DD; defaults to the reliable-data cutoff (2026-08-03)")
    p.add_argument("--dry-run", action="store_true", help="Show the batch without creating a mission")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc) if args.since else None
    asyncio.run(run_digest(wallet=args.wallet, limit=args.limit, since=since, dry_run=args.dry_run))
