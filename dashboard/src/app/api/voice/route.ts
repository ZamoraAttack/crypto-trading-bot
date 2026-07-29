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
      const saved = await api.memory.create({ category, title, content, source: "voice" });
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
];

const SYSTEM_PROMPT = `You are ZAMO (Zamora Advanced Machine Operations), Alan's personal AI assistant and founder operating system. You have tools to look up live data on his crypto trading bot and Polymarket copy-trading bot — always call a tool rather than guessing when asked about status, PnL, trades, signals, or risk state.

You also have persistent memory (remember/recall). Use it two ways:
- Proactively call "remember" when the conversation produces a durable decision, goal, fact, or outcome worth keeping — don't wait to be asked.
- Call "recall" before answering anything that depends on past context (e.g. "what did we decide about X") rather than answering from the current conversation alone.

Your replies are spoken aloud via text-to-speech, so:
- Never use markdown, bullet points, headers, or code blocks.
- Keep answers short and conversational — a sentence or two unless the user asks for detail.
- Read numbers naturally (e.g. "up forty two dollars" not "+$42.00").`;

interface VoiceRequestBody {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as VoiceRequestBody;

  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const history = (body.history ?? []).slice(-10);

  const runner = client.beta.messages.toolRunner({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
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
