import asyncio
from intelligence.mission_engine import create_mission, run_mission

OBJECTIVE = (
    "Given ZAMO's existing internal research on the payroll-embedded remittance MVP "
    "(see internal_knowledge in constraints), identify the single highest-leverage "
    "type of prospect for the founder to approach first to pilot or validate the "
    "concept. Explain who they are, why they are worth contacting now, what "
    "relationship stage a first contact would start at, what outreach angle would "
    "resonate given the evidence gathered so far, what objections or hesitations to "
    "expect, and what the concrete next action should be."
)

SUCCESS_CRITERIA = (
    "A specific, evidence-grounded recommendation that names a concrete prospect "
    "type (not a vague market segment), a relationship-stage assessment, an "
    "outreach angle grounded in the cited evidence, and one concrete next action "
    "the founder can personally take this week -- not a generic sales playbook."
)

INTERNAL_KNOWLEDGE = [
    {
        "id": 14, "category": "decision",
        "title": "ZAMO remittance MVP: design around pay-cycle conversion friction, not price",
        "content": (
            "Design the payroll-embedded remittance MVP around 'every pay cycle the worker "
            "manually converts a paycheck into delivered money at home, funded in the most "
            "expensive and now-taxed way, with no certainty it arrives' -- explicitly NOT "
            "around being cheaper. Price is not defensible: US-Mexico all-in ~4% (from >8% a "
            "decade ago), digital MTOs ~3.55%, Felix Pago $2.50-2.99 flat. Transparency and a "
            "delivery guarantee are the differentiators, not cost."
        ),
    },
    {
        "id": 15, "category": "strategic",
        "title": "Directo a Mexico: the cheapest remittance rail ever built still lost",
        "content": (
            "The Fed/Banxico Directo a Mexico ACH channel (~2004-05) was priced so US banks "
            "could undercut Western Union and MoneyGram and enrolled 380+ institutions, yet "
            "never displaced them: recipients still had to visit a branch with ID, banks had "
            "no distribution incentive, and tightened regulation pushed banks out later. "
            "Durable lesson: price alone does not win this market -- distribution and "
            "recipient cash-out experience decide winners."
        ),
    },
    {
        "id": 16, "category": "market",
        "title": "US remittance sender pain hierarchy and the complain/switch gap",
        "content": (
            "(1) COST OPACITY: true cost hides in FX markup, not the advertised fee; a Wise "
            "survey found 72% of Filipino senders believed they understood costs while only "
            "18% recognised hidden FX markup impact. (2) DELIVERY UNCERTAINTY: dominant CFPB "
            "complaint themes are non-receipt, receiving less than expected, and unexplained "
            "delays. Senders complain about these pains but rarely switch providers on their "
            "own -- inertia and trust in an existing habit dominate."
        ),
    },
    {
        "id": 17, "category": "technical",
        "title": "Payroll-embedded remittance: EWA precedent proves the channel",
        "content": (
            "Earned Wage Access is an established employer-distributed financial product "
            "(DailyPay, Earnin, Payactiv, plus US Bank/PNC/Citizens partnerships); 93% of "
            "employers in an ADP survey believe EWA improves retention; paycards like ADP "
            "Wisely already onboard unbanked hourly workers with no credit check. Employer "
            "EWA adoption is estimated around 10%, so the channel is not saturated -- and no "
            "EWA provider currently bundles a remittance/delivery-guarantee product on top."
        ),
    },
    {
        "id": 18, "category": "financial",
        "title": "1% remittance excise tax penalises cash-funded transfers",
        "content": (
            "From 1 Jan 2026, IRC 4475 (One Big Beautiful Bill Act) imposes a 1% federal "
            "excise tax on remittances funded with cash, money orders or cashier's checks; "
            "bank-account, debit and credit funded transfers are exempt. This is a "
            "government-imposed cost wedge against the cash-in agent model (Western Union, "
            "MoneyGram) and a structural advantage for any paycheck/account-funded product."
        ),
    },
]

CONSTRAINTS = {
    "internal_knowledge": INTERNAL_KNOWLEDGE,
    "mvp_stage": "pre-product -- validating demand and channel before building anything",
    "founder_capacity": (
        "Solo founder, no sales team, can personally hold a small number of real "
        "conversations. Any recommended outreach must be something one person can "
        "realistically do themselves."
    ),
    "explicit_boundary": (
        "Do not draft an actual outreach message and do not name a specific real "
        "company or person to contact -- describe the prospect type, the approach, "
        "and the reasoning. Actually contacting anyone is the founder's decision, "
        "not this department's action."
    ),
}


async def main():
    mission = await create_mission(
        title="RM proof mission: first pilot prospect for the remittance MVP",
        objective=OBJECTIVE,
        department_slug="relationship_management",
        success_criteria=SUCCESS_CRITERIA,
        constraints=CONSTRAINTS,
        authority_granted="draft",
        created_by="founder",
    )
    print("mission_id:", mission.id)
    await run_mission(mission.id)
    print("done")


asyncio.run(main())
