import { createServer } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import * as audio from "./audio.js";
import { createCalendarSync } from "./calendar.js";
import { convexCalendarStore } from "./calendar-store.js";
import { config, missingConfig } from "./config.js";
import { api, convex, secret, type Id } from "./convex.js";
import { logger } from "./log.js";
import * as memory from "./memory.js";
import * as recall from "./recall.js";
import { allSessions, dropSession, loadSession, type MeetingSession } from "./session.js";
import { startSlack } from "./slack.js";

const log = logger("server");

const syncCalendar = createCalendarSync({ recall: recall.client, store: convexCalendarStore, config });

const app = createApp({
  health: () => ({ ok: true, missing: missingConfig(), sessions: allSessions().length }),
  webhooks: {
    secret: config.recall.webhookSecret,
    claim: (eventId) => convex.mutation(api.orchestrator.claimWebhook, { secret, eventId }),
    onRealtime: (evt) => handleRealtime(evt as RealtimeEvent),
    onDashboard: (evt) => handleDashboard(evt),
  },
});

// ------------------------------------------------------------------ auth helpers

/** Calls from Convex carry the shared secret in a header. */
function internalOnly(req: Request, res: Response, next: NextFunction) {
  if (!config.secret || req.header("x-jarvis-secret") !== config.secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function route(handler: (body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      res.json((await handler(req.body ?? {})) ?? { ok: true });
    } catch (e) {
      log.error(`${req.path} failed: ${(e as Error).message}`);
      res.status(500).json({ error: (e as Error).message });
    }
  };
}

function str(v: unknown, name: string) {
  if (typeof v !== "string" || !v) throw new Error(`Missing ${name}`);
  return v;
}

// ------------------------------------------------------------------ meetings

app.post(
  "/meetings/start",
  internalOnly,
  route(async (body) => {
    const meetingId = str(body.meetingId, "meetingId");
    const session = await loadSession(meetingId);
    if (!session) throw new Error("Meeting not found or already over.");
    if (session.botId) return { botId: session.botId };
    // Two starts for one meeting must not create two bots.
    const inflight = starting.get(meetingId);
    if (inflight) return inflight;
    const p = startBot(meetingId, session).finally(() => starting.delete(meetingId));
    starting.set(meetingId, p);
    return p;
  }),
);

const starting = new Map<string, Promise<{ botId: string }>>();

async function startBot(meetingId: string, session: MeetingSession) {
  let botId: string;
  try {
    // If we crashed after Recall created the bot but before saving its id, reuse that bot.
    const existing = await recall.client.findBotsByMeetingId(meetingId).catch(() => []);
    botId =
      existing[0]?.id ??
      (await recall.createBot({ meetingId, meetUrl: await meetUrlOf(meetingId), botName: session.name })).id;
  } catch (e) {
    dropSession(meetingId);
    throw e;
  }
  session.botId = botId;
  await convex.mutation(api.orchestrator.setBot, { secret, meetingId: meetingId as Id<"meetings">, recallBotId: botId });
  return { botId };
}

async function meetUrlOf(meetingId: string) {
  const ctx = await convex.query(api.orchestrator.meetingContext, { secret, meetingId: meetingId as Id<"meetings"> });
  if (!ctx) throw new Error("Meeting not found.");
  return ctx.meeting.meetUrl;
}

app.post(
  "/meetings/stop",
  internalOnly,
  route(async (body) => {
    const meetingId = str(body.meetingId, "meetingId");
    const session = await loadSession(meetingId);
    if (!session) return;
    if (session.botId) {
      try {
        await recall.leaveCall(session.botId);
        return; // the status webhook / poller finishes the meeting
      } catch (e) {
        log.warn(`leave_call failed, ending locally: ${(e as Error).message}`);
      }
    }
    await finish(session);
  }),
);

app.post(
  "/meetings/unschedule",
  internalOnly,
  route(async (body) => {
    const meetingId = str(body.meetingId, "meetingId");
    const ctx = await convex.query(api.orchestrator.meetingContext, { secret, meetingId: meetingId as Id<"meetings"> });
    const eventId = ctx?.meeting.calendarEventId;
    if (eventId) await recall.client.removeCalendarEventBot(eventId);
    dropSession(meetingId);
  }),
);

app.post(
  "/calendar/list",
  internalOnly,
  route(async () => ({
    calendars: (await recall.client.listCalendars()).map((c) => ({
      id: c.id,
      platform: c.platform,
      platformEmail: c.platform_email ?? null,
      status: c.status,
    })),
  })),
);

app.post(
  "/calendar/sync",
  internalOnly,
  route(async (body) => ({ result: await syncCalendar(str(body.recallCalendarId, "recallCalendarId")) })),
);

async function finish(session: MeetingSession, failed = false, error?: string) {
  dropSession(session.meetingId);
  await session.end(failed, error);
}

// ------------------------------------------------------------------ memory (called by Convex)

app.post(
  "/memory/index-document",
  internalOnly,
  route(async (body) => ({
    docIds: await memory.indexDocument({
      indexName: str(body.indexName, "indexName"),
      documentId: str(body.documentId, "documentId"),
      fileName: str(body.fileName, "fileName"),
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      url: str(body.url, "url"),
    }),
  })),
);

app.post(
  "/memory/add-docs",
  internalOnly,
  route(async (body) => {
    await memory.addDocs(str(body.indexName, "indexName"), (body.docs as memory.MemoryDoc[]) ?? []);
  }),
);

app.post(
  "/memory/delete-docs",
  internalOnly,
  route(async (body) => {
    await memory.deleteDocs(str(body.indexName, "indexName"), (body.docIds as string[]) ?? []);
  }),
);

app.post(
  "/memory/delete-index",
  internalOnly,
  route(async (body) => {
    await memory.deleteIndex(str(body.indexName, "indexName"));
  }),
);

app.post(
  "/memory/search",
  internalOnly,
  route(async (body) => ({
    hits: await memory.search(
      str(body.indexName, "indexName"),
      str(body.query, "query"),
      typeof body.topK === "number" ? body.topK : 5,
    ),
  })),
);

// ------------------------------------------------------------------ Recall webhooks
// Requests are verified and acknowledged in webhooks.ts; these handlers do the work afterwards.

type Participant = { id: number; name: string | null };
type Word = { text: string; start_timestamp?: { relative: number } };
type RealtimeEvent = {
  event: string;
  data: {
    data: {
      words?: Word[];
      participant?: Participant;
      data?: { text?: string };
    };
    bot?: { id: string; metadata?: Record<string, string> };
  };
};

async function sessionForBot(bot?: { id: string; metadata?: Record<string, string> }) {
  if (!bot) return null;
  let meetingId = bot.metadata?.meetingId;
  if (!meetingId) {
    const m = await convex.query(api.orchestrator.meetingByBotId, { secret, recallBotId: bot.id });
    meetingId = m?._id;
  }
  if (!meetingId) return null;
  const s = await loadSession(meetingId);
  if (s && !s.botId) s.botId = bot.id;
  return s;
}

async function handleRealtime(evt: RealtimeEvent) {
  const session = await sessionForBot(evt.data?.bot);
  if (!session || session.ended) return;
  const inner = evt.data.data;
  const participant = inner.participant;
  const speaker = participant?.name?.trim() || "Someone";
  const pid = participant?.id ?? -1;

  if (evt.event === "transcript.partial_data" || evt.event === "transcript.data") {
    const words = inner.words ?? [];
    const text = words.map((w) => w.text).join(" ").replace(/\s+([,.!?])/g, "$1").trim();
    if (!text) return;
    // Transcript flowing means the bot is in the call, even if no status webhook arrived.
    void session.goLive();
    if (evt.event === "transcript.partial_data") session.onPartial(pid, speaker, text);
    else await session.onFinal(pid, speaker, text, words[0]?.start_timestamp?.relative ?? 0);
  } else if (evt.event === "participant_events.chat_message") {
    const text = inner.data?.text ?? "";
    if (text) await session.onChat(speaker, text);
  }
}

async function applyStatus(session: MeetingSession, code: string, subCode: string | null) {
  if (code === "joining_call" || code === "in_waiting_room") {
    await convex.mutation(api.orchestrator.setStatus, { secret, meetingId: session.meetingId, status: "joining" });
  } else if (code === "in_call_recording") await session.goLive();
  else if (code === "call_ended" || code === "done") await finish(session);
  else if (code === "fatal") await finish(session, true, `The bot couldn't stay in the call (${subCode ?? "fatal error"}).`);
}

type DashboardEvent = { event: string; data: Record<string, any> };

async function handleDashboard(evt: DashboardEvent) {
  if (evt.event.startsWith("bot.")) {
    const code = evt.event.replace(/^bot\./, "");
    const session = await sessionForBot(evt.data?.bot);
    if (!session || session.ended) return;
    log.info(`status ${code} for ${session.meetingId}`);
    await applyStatus(session, code, evt.data?.data?.sub_code ?? null);
  } else if (evt.event === "calendar.sync_events") {
    const calendarId = evt.data?.calendar_id;
    if (typeof calendarId === "string") await syncCalendar(calendarId);
  } else if (evt.event === "calendar.update") {
    log.warn("a calendar changed state (it may have disconnected); check it in Recall");
  }
}

// Fallback poller so meetings start and end correctly even if a status webhook is missed.
setInterval(() => {
  for (const s of allSessions()) {
    if (!s.botId || s.ended || s.botId.startsWith("sim-")) continue; // sim-: simulated meetings
    recall
      .getBotStatus(s.botId)
      .then((st) => st && applyStatus(s, st.code, st.subCode))
      .catch((e) => log.warn(`status poll failed: ${(e as Error).message}`));
  }
}, 10_000);

// Calendar webhooks can be missed while the server is down, so every linked calendar is re-synced on a timer.
async function reconcileCalendars() {
  if (!config.secret || !config.recall.apiKey) return;
  const links = await convex.query(api.orchestrator.calendarLinks, { secret });
  for (const l of links) await syncCalendar(l.recallCalendarId).catch((e) => log.warn(`calendar sync failed: ${(e as Error).message}`));
}
setInterval(() => void reconcileCalendars().catch((e) => log.warn(`reconcile failed: ${(e as Error).message}`)), 10 * 60_000);

// ------------------------------------------------------------------ server + audio socket

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const meetingId = url.searchParams.get("meetingId");
  if (url.pathname !== "/audio" || !meetingId) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => audio.attachClient(meetingId, ws));
});

async function resumeActiveMeetings() {
  if (!config.secret) return;
  try {
    const active = await convex.query(api.orchestrator.activeMeetings, { secret });
    for (const m of active) await loadSession(m._id);
    if (active.length) log.info(`resumed ${active.length} active meeting(s)`);
  } catch (e) {
    log.warn(`couldn't load active meetings: ${(e as Error).message}`);
  }
}

server.listen(config.port, () => {
  log.info(`orchestrator listening on :${config.port} (public ${config.publicUrl})`);
  const missing = missingConfig();
  if (missing.length) log.warn(`not configured: ${missing.join(", ")}`);
  void resumeActiveMeetings();
  void reconcileCalendars().catch((e) => log.warn(`reconcile failed: ${(e as Error).message}`));
  void startSlack().catch((e) => log.error(`Slack failed to start: ${(e as Error).message}`));
});
