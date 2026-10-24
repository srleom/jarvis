import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendarSync, decide, type CalendarStore } from "./calendar.js";
import type { CalendarEvent } from "./recall.js";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const cfg = {
  publicUrl: "https://api.example.test",
  botPageBaseUrl: "https://web.example.test",
  recall: { outputMode: "screenshare" as const, calendarOptIn: "all" as const },
};

function event(over: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    calendar_id: "cal1",
    start_time: "2026-10-25T10:00:00Z",
    end_time: "2026-10-25T11:00:00Z",
    meeting_url: "https://meet.google.com/abc-defg-hij",
    is_deleted: false,
    updated_at: "2026-10-24T11:00:00Z",
    raw: { summary: "Weekly sync" },
    ...over,
  };
}

test("decide: records future Meet events and skips past, deleted, linkless, declined and opted-out ones", () => {
  const d = (e: CalendarEvent, optIn: "all" | "tagged" = "all") => decide(e, { now: NOW, optIn });
  assert.deepEqual(d(event({ id: "a" })), { record: true });
  assert.deepEqual(d(event({ id: "b", end_time: "2026-10-24T11:00:00Z" })), {
    record: false,
    reason: "ended",
  });
  assert.deepEqual(d(event({ id: "c", is_deleted: true })), {
    record: false,
    reason: "deleted",
  });
  assert.deepEqual(d(event({ id: "d", meeting_url: null })), {
    record: false,
    reason: "no_meet_link",
  });
  assert.deepEqual(d(event({ id: "e", meeting_url: "https://zoom.us/j/123" })), {
    record: false,
    reason: "no_meet_link",
  });
  assert.deepEqual(d(event({ id: "f", raw: { summary: "Private [nojarvis]" } })), {
    record: false,
    reason: "opted_out",
  });
  assert.deepEqual(
    d(
      event({
        id: "g",
        raw: { attendees: [{ self: true, responseStatus: "declined" }] },
      }),
    ),
    { record: false, reason: "declined" },
  );
  assert.deepEqual(d(event({ id: "h" }), "tagged"), {
    record: false,
    reason: "not_tagged",
  });
  assert.deepEqual(d(event({ id: "i", raw: { summary: "Board [jarvis]" } }), "tagged"), { record: true });
});

function harness(events: CalendarEvent[], opts: { linked?: boolean; failSchedule?: boolean } = {}) {
  const log = {
    scheduled: [] as string[],
    removed: [] as string[],
    bots: [] as string[],
    discarded: [] as string[],
    synced: [] as string[],
    cancelled: new Set<string>(),
    listSince: [] as (string | undefined)[],
    botConfigs: [] as Record<string, unknown>[],
  };
  const rows = new Map<string, string>(); // calendarEventId -> meetingId
  const store: CalendarStore = {
    getLink: async () => (opts.linked === false ? null : { id: "link1", agentId: "agent1" }),
    agentName: async () => "Jarvis",
    setSynced: async (_id, at) => void log.synced.push(at),
    schedule: async (a) => {
      if (log.cancelled.has(a.calendarEventId)) return { kind: "skipped", reason: "cancelled" };
      const id = rows.get(a.calendarEventId) ?? `meeting_${rows.size + 1}`;
      rows.set(a.calendarEventId, id);
      return { kind: "scheduled", meetingId: id };
    },
    recordBot: async (_m, bot) => void log.bots.push(bot),
    discard: async (m) => void log.discarded.push(m),
    cancelByEvent: async (id) => (rows.has(id) ? rows.get(id)! : null),
  };
  const recall = {
    listCalendarEvents: async (_c: string, since?: string) => (log.listSince.push(since), events),
    scheduleCalendarEventBot: async (id: string, key: string, botConfig: Record<string, unknown>) => {
      if (opts.failSchedule) throw new Error("recall down");
      log.scheduled.push(`${id}|${key}`);
      log.botConfigs.push(botConfig);
      return {
        ...events.find((e) => e.id === id)!,
        bots: [{ bot_id: `bot_${id}` }],
      };
    },
    removeCalendarEventBot: async (id: string) => void log.removed.push(id),
  };
  const sync = createCalendarSync({
    recall,
    store,
    config: cfg,
    now: () => NOW,
  });
  return { sync, log };
}

test("schedules eligible future events with a dedup key and stores the bot id", async () => {
  const { sync, log } = harness([
    event({ id: "e1" }),
    event({ id: "past", end_time: "2026-10-24T09:00:00Z" }),
    event({ id: "nolink", meeting_url: null }),
    event({ id: "gone", is_deleted: true }),
  ]);
  const result = await sync("cal1");
  assert.equal(result?.scheduled, 1);
  assert.deepEqual(log.scheduled, ["e1|2026-10-25T10:00:00Z-https://meet.google.com/abc-defg-hij"]);
  assert.deepEqual(log.bots, ["bot_e1"]);
  assert.equal((log.botConfigs[0]?.metadata as { meetingId: string }).meetingId, "meeting_1");
  assert.equal(result?.skipped.ended, 1);
  assert.equal(result?.skipped.no_meet_link, 1);
  assert.equal(result?.skipped.deleted, 1);
  assert.deepEqual(log.synced, ["2026-10-24T11:00:00Z"]);
});

test("an event that is deleted or newly opted out cancels its scheduled meeting", async () => {
  const events = [event({ id: "e1" }), event({ id: "e2" })];
  const { sync, log } = harness(events);
  assert.equal((await sync("cal1"))?.scheduled, 2);

  events[0] = event({
    id: "e1",
    raw: { summary: "now private [nojarvis]" },
    updated_at: "2026-10-24T11:30:00Z",
  });
  events[1] = event({
    id: "e2",
    is_deleted: true,
    updated_at: "2026-10-24T11:31:00Z",
  });
  const result = await sync("cal1");
  assert.equal(result?.cancelled, 2);
  // Recall unschedules deleted events by itself, so only the opted-out one needs an explicit removal.
  assert.deepEqual(log.removed, ["e1"]);
});

test("a calendar that isn't linked to an agent is ignored", async () => {
  const { sync, log } = harness([event({ id: "e1" })], { linked: false });
  assert.equal(await sync("cal1"), null);
  assert.deepEqual(log.scheduled, []);
});

test("a failed Recall schedule discards the intent and keeps the cursor so it is retried", async () => {
  const { sync, log } = harness([event({ id: "e1" })], { failSchedule: true });
  const result = await sync("cal1");
  assert.equal(result?.failed, 1);
  assert.deepEqual(log.discarded, ["meeting_1"]);
  assert.deepEqual(log.synced, []);
});

test("concurrent syncs of one calendar are serialized", async () => {
  const { sync, log } = harness([event({ id: "e1" })]);
  await Promise.all([sync("cal1"), sync("cal1")]);
  assert.equal(log.listSince.length, 2);
  assert.equal(log.scheduled.length, 2); // same event re-sent to Recall, which dedups by key
  assert.equal(new Set(log.bots).size, 1);
});
