import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { api } from "@/lib/api";
import { searchEmails, isConnected as isGmailConnected } from "@/lib/gmail";
import { getUpcomingEvents, isConnected as isCalendarConnected } from "@/lib/calendar";

const client = new Anthropic();

const BOT_ENUM = ["crypto", "polymarket"] as const;
const MEMORY_CATEGORY_ENUM = [
  "decision", "goal", "business_knowledge", "relationship",
  "conversation", "experiment", "outcome", "agent_history",
] as const;

const tools = [
  betaTool({
    name: "get_bot_status",
    description: "Get live status for all trading bots — running/stopped state, mode, last heartbeat, open position count, and today's PnL.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(await api.pg.bots()),
  }),
  betaTool({
    name: "get_trade_summary",
    description: "Get aggregate trade stats — total trades, win rate, total PnL, average win/loss, open position count.",
    inputSchema: {
      type: "object",
      properties: { bot: { type: "string", enum: BOT_ENUM, description: "Filter to one bot. Omit for all bots combined." } },
      additionalProperties: false,
    },
    run: async ({ bot }) => JSON.stringify(await api.pg.summary(bot)),
  }),
  betaTool({
    name: "get_recent_trades",
    description: "Get recent individual trades with entry/exit price, quantity, and PnL.",
    inputSchema: {
      type: "object",
      properties: {
        bot: { type: "string", enum: BOT_ENUM, description: "Filter to one bot. Omit for all bots." },
        status: { type: "string", enum: ["open", "closed"], description: "Filter by trade status. Omit for all." },
      },
      additionalProperties: false,
    },
    run: async ({ bot, status }) => JSON.stringify(await api.pg.trades(bot, status)),
  }),
  betaTool({
    name: "get_recent_signals",
    description: "Get recent trading signals a bot evaluated, including scores and whether they were acted on or rejected.",
    inputSchema: {
      type: "object",
      properties: { bot: { type: "string", enum: BOT_ENUM, description: "Filter to one bot. Omit for all bots." } },
      additionalProperties: false,
    },
    run: async ({ bot }) => JSON.stringify(await api.pg.signals(bot)),
  }),
  betaTool({
    name: "get_risk_state",
    description: "Get today's risk state for the crypto bot — realized PnL, whether trading is halted and why, risk limits, current balance.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(await api.risk()),
  }),
  betaTool({
    name: "get_polymarket_stats",
    description: "Get Polymarket copy-trading bot stats — total PnL, win rate, trades in the last 24h, most recent trade.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(await api.polymarketStats()),
  }),
  betaTool({
    name: "get_revenue",
    description: "Get combined trading revenue (realized PnL) across both bots, rolled up by month — includes this month's total per bot, progress toward the Polymarket bot's $1,000/month goal, and recent monthly history.",
    inputSchema: {
      type: "object",
      properties: { months: { type: "integer", description: "How many recent months of history to include. Defaults to 6." } },
      additionalProperties: false,
    },
    run: async ({ months }) => JSON.stringify(await api.pg.revenue(months)),
  }),
  betaTool({
    name: "remember",
    description: "Save something durable to ZAMO's memory — a decision made, a goal set, a fact learned about the business, a relationship update, or an outcome worth keeping. Use this proactively whenever the conversation produces something worth remembering later, not just when explicitly asked.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: MEMORY_CATEGORY_ENUM, description: "What kind of memory this is." },
        title: { type: "string", description: "Short label for the memory." },
        content: { type: "string", description: "The full detail to remember." },
      },
      required: ["category", "title", "content"],
      additionalProperties: false,
    },
    run: async ({ category, title, content }) => {
      const saved = await api.memory.create({ category, title, content, source: "assistant" });
      return JSON.stringify(saved);
    },
  }),
  betaTool({
    name: "recall",
    description: "Search ZAMO's memory for past decisions, goals, business knowledge, relationships, or history. Use this when a question depends on something discussed or decided previously, not just live bot data.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: MEMORY_CATEGORY_ENUM, description: "Filter to one category. Omit to search all." },
        query: { type: "string", description: "Keywords to search for in the memory's title or content." },
      },
      additionalProperties: false,
    },
    run: async ({ category, query }) => JSON.stringify(await api.memory.list({ category, q: query })),
  }),
  betaTool({
    name: "draft_mission",
    description: "Draft a proposed mission for founder review — this does NOT persist anything. Always call this first whenever the conversation suggests deliberate, meaningful work for a department (research, analysis, investigation) — never call create_mission directly on a first ask. Present the returned draft to Alan in plain language and wait for his explicit confirmation before ever calling create_mission.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short mission title." },
        objective: { type: "string", description: "What this mission should accomplish, and why." },
        department_slug: { type: "string", description: 'The department that should own this mission, e.g. "research". Only active departments can be assigned.' },
        success_criteria: { type: "string", description: "What success looks like for this mission." },
      },
      required: ["title", "objective", "department_slug"],
      additionalProperties: false,
    },
    run: async ({ title, objective, department_slug, success_criteria }) => {
      const departments = await api.zamo.departments();
      const dept = departments.find(d => d.slug === department_slug);
      if (!dept) {
        return JSON.stringify({
          error: `Unknown department "${department_slug}". Active departments: ${departments.filter(d => d.status === "active").map(d => d.slug).join(", ") || "none"}.`,
        });
      }
      if (dept.status !== "active") {
        return JSON.stringify({ error: `${dept.name} is not active yet — only Research is implemented so far.` });
      }
      return JSON.stringify({
        draft: { title, objective, department_slug, department_name: dept.name, success_criteria },
        note: "This is a draft only, nothing was persisted. Present it to Alan and wait for his explicit confirmation before calling create_mission.",
      });
    },
  }),
  betaTool({
    name: "create_mission",
    description: "Persist a mission and kick off the Mission Control Loop (Research Department only, for now). Only call this AFTER the founder has explicitly confirmed a draft you presented via draft_mission earlier in this same conversation — never on the first ask, and never from casual discussion alone.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        objective: { type: "string" },
        department_slug: { type: "string" },
        success_criteria: { type: "string" },
      },
      required: ["title", "objective", "department_slug"],
      additionalProperties: false,
    },
    run: async ({ title, objective, department_slug, success_criteria }) => {
      const mission = await api.zamo.missions.create({
        title, objective, department_slug, success_criteria, created_by: "founder",
      });
      return JSON.stringify(mission);
    },
  }),
  betaTool({
    name: "search_emails",
    description: "Search Alan's tech/AI-ops Gmail inbox (zamoraattack@gmail.com) — the account tied to his VPS, Hostinger, and Anthropic Console billing. Use this for anything email-related: billing issues, VPS notices, service alerts. Only searches the Primary category, so results are never promotions/spam/social.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search syntax, e.g. 'from:anthropic', 'subject:billing', 'is:unread'. Omit to get the most recent primary-inbox emails." },
      },
      additionalProperties: false,
    },
    run: async ({ query }) => {
      if (!(await isGmailConnected())) {
        return JSON.stringify({ error: "Gmail is not connected yet. Tell Alan to visit the Connectors page to connect it." });
      }
      try {
        return JSON.stringify(await searchEmails(query ?? ""));
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : "Gmail search failed." });
      }
    },
  }),
  betaTool({
    name: "get_upcoming_events",
    description: "Get Alan's upcoming calendar events (zamoraattack@gmail.com's primary calendar) — use for 'what's on my day/week', scheduling questions, or checking for conflicts before suggesting a meeting time.",
    inputSchema: {
      type: "object",
      properties: {
        max_results: { type: "number", description: "How many upcoming events to return. Defaults to 10." },
      },
      additionalProperties: false,
    },
    run: async ({ max_results }) => {
      if (!(await isCalendarConnected())) {
        return JSON.stringify({ error: "Calendar is not connected yet. Tell Alan to visit the Connectors page to connect it." });
      }
      try {
        return JSON.stringify(await getUpcomingEvents(max_results));
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : "Calendar fetch failed." });
      }
    },
  }),
  // Anthropic-hosted server tool — no run function, executes on Anthropic's infra.
  { type: "web_search_20260209", name: "web_search" } as const,
];

// Shared base prompt for every surface (voice, in-OS text, future Telegram) — same brain,
// same tools, same memory, regardless of where the message came from. Only the output-format
// guidance at the end differs per surface (see SURFACE_SUFFIX).
const BASE_SYSTEM_PROMPT = `You are ZAMO (Zamora Advanced Machine Operations), Alan's personal AI assistant and founder operating system. You have tools to look up live data on his crypto trading bot and Polymarket copy-trading bot — always call a tool rather than guessing when asked about status, PnL, trades, signals, or risk state.

You also have persistent memory (remember/recall). Use it two ways:
- Proactively call "remember" when the conversation produces a durable decision, goal, fact, or outcome worth keeping — don't wait to be asked.
- Call "recall" before answering anything that depends on past context (e.g. "what did we decide about X") rather than answering from the current conversation alone.

You have a web_search tool for anything outside your training data or Alan's own systems — current events, market/competitor research, prices, or general lookups. Use it rather than guessing or answering from stale knowledge.

You can also assign work to ZAMO's Executive Departments via missions. Never create a mission from casual discussion — if the conversation suggests meaningful, deliberate work (a research task, an investigation), call "draft_mission" first, present the draft in plain language, and only call "create_mission" after Alan explicitly confirms it. Mission creation represents deliberate organizational intent, not exploratory conversation.`;

const SURFACE_SUFFIX: Record<"voice" | "text", string> = {
  voice: `

Your replies are spoken aloud via text-to-speech, so:
- Never use markdown, bullet points, headers, or code blocks.
- Keep answers short and conversational — a sentence or two unless the user asks for detail.
- Read numbers naturally (e.g. "up forty two dollars" not "+$42.00").`,
  text: `

Your replies are shown in a text chat panel inside the dashboard, so:
- Plain prose is fine; avoid heavy markdown (no headers, tables, or code blocks) since the panel is a simple chat view, not a document renderer.
- Keep answers concise — a short paragraph unless the user asks for detail.
- Numbers can be written normally (e.g. "+$42.00").`,
};

interface AssistantRequestBody {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  surface?: "voice" | "text";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AssistantRequestBody;

  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const surface = body.surface === "text" ? "text" : "voice";
  const history = (body.history ?? []).slice(-10);

  const runner = client.beta.messages.toolRunner({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: BASE_SYSTEM_PROMPT + SURFACE_SUFFIX[surface],
    tools,
    messages: [...history, { role: "user", content: body.message }],
  });

  const finalMessage = await runner.runUntilDone();

  const reply = finalMessage.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map(block => block.text)
    .join(" ")
    .trim();

  return NextResponse.json({ reply });
}
