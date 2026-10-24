import { buildBotConfig, type CalendarEvent, type RecallClient } from "./recall.js";
import type { Config } from "./config.js";
import { logger } from "./log.js";

const log = logger("calendar");

const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4}(\?.*)?$/i;

export type Decision = { record: true } | { record: false; reason: string };

/**
 * The recording rule for calendar events. Opt-in is a product choice: the default records every
 * future Google Meet event on a linked calendar, and `tagged` records only events that contain
 * [jarvis]. Either way an event can opt out with [nojarvis] or by the calendar owner declining it.
 */
export function decide(event: CalendarEvent, opts: { now: number; optIn: "all" | "tagged" }): Decision {
  if (event.is_deleted) return { record: false, reason: "deleted" };
  if (!event.meeting_url || !MEET_URL.test(event.meeting_url)) return { record: false, reason: "no_meet_link" };
  if (Date.parse(event.end_time) <= opts.now) return { record: false, reason: "ended" };

  const text = `${event.raw?.summary ?? ""}\n${event.raw?.description ?? ""}`.toLowerCase();
  if (text.includes("[nojarvis]")) return { record: false, reason: "opted_out" };
  if (event.raw?.attendees?.some((a) => a.self && a.responseStatus === "declined")) {
    return { record: false, reason: "declined" };
  }
  if (opts.optIn === "tagged" && !text.includes("[jarvis]")) return { record: false, reason: "not_tagged" };
  return { record: true };
}

export type CalendarStore = {
  getLink(recallCalendarId: string): Promise<{ id: string; agentId: string; syncedThrough?: string } | null>;
  agentName(agentId: string): Promise<string>;
  setSynced(linkId: string, syncedThrough: string): Promise<void>;
  /** Persists the intent to join before Recall is asked to schedule anything. */
  schedule(args: {
    agentId: string;
    calendarEventId: string;
    meetUrl: string;
    title?: string;
    scheduledFor: number;
    scheduledEnd: number;
  }): Promise<{ kind: "scheduled"; meetingId: string } | { kind: "skipped"; reason: string }>;
  recordBot(meetingId: string, botId: string): Promise<void>;
  discard(meetingId: string): Promise<void>;
  cancelByEvent(calendarEventId: string): Promise<string | null>;
};

export type CalendarSyncDeps = {
  recall: Pick<RecallClient, "listCalendarEvents" | "scheduleCalendarEventBot" | "removeCalendarEventBot">;
  store: CalendarStore;
  config: Pick<Config, "publicUrl" | "botPageBaseUrl"> & {
    recall: Pick<Config["recall"], "outputMode" | "calendarOptIn">;
  };
  now?: () => number;
};

export type SyncResult = {
  scheduled: number;
  cancelled: number;
  skipped: Record<string, number>;
  failed: number;
};

/** One bot per start time and meeting link, shared across every calendar in the workspace. */
export function deduplicationKey(event: Pick<CalendarEvent, "start_time" | "meeting_url">) {
  return `${event.start_time}-${event.meeting_url}`;
}

export function createCalendarSync(deps: CalendarSyncDeps) {
  const { recall, store } = deps;
  const chains = new Map<string, Promise<unknown>>();

  async function run(recallCalendarId: string): Promise<SyncResult | null> {
    const result: SyncResult = {
      scheduled: 0,
      cancelled: 0,
      skipped: {},
      failed: 0,
    };
    const link = await store.getLink(recallCalendarId);
    if (!link) {
      log.warn("calendar event received for a calendar that isn't linked to an agent");
      return null;
    }
    const now = (deps.now ?? Date.now)();
    const events = (await recall.listCalendarEvents(recallCalendarId, link.syncedThrough)).sort(
      (a, b) => Date.parse(a.start_time) - Date.parse(b.start_time),
    );
    const skip = (reason: string) => (result.skipped[reason] = (result.skipped[reason] ?? 0) + 1);
    let newest = link.syncedThrough;

    for (const event of events) {
      const decision = decide(event, {
        now,
        optIn: deps.config.recall.calendarOptIn,
      });
      try {
        if (decision.record) {
          const intent = await store.schedule({
            agentId: link.agentId,
            calendarEventId: event.id,
            meetUrl: event.meeting_url!,
            title: event.raw?.summary,
            scheduledFor: Date.parse(event.start_time),
            scheduledEnd: Date.parse(event.end_time),
          });
          if (intent.kind === "skipped") {
            skip(intent.reason);
          } else {
            try {
              const botName = await store.agentName(link.agentId);
              const scheduled = await recall.scheduleCalendarEventBot(
                event.id,
                deduplicationKey(event),
                buildBotConfig(deps.config, {
                  meetingId: intent.meetingId,
                  botName,
                }),
              );
              const botId = scheduled.bots?.at(-1)?.bot_id;
              if (botId) await store.recordBot(intent.meetingId, botId);
              result.scheduled++;
            } catch (e) {
              await store.discard(intent.meetingId);
              throw e;
            }
          }
        } else if (decision.reason === "ended") {
          skip("ended");
        } else {
          // Deleted, opted out or declined. A previously scheduled meeting must not stay on the books.
          const cancelled = await store.cancelByEvent(event.id);
          if (cancelled) {
            result.cancelled++;
            // Recall unschedules deleted events by itself; the other cases need an explicit removal.
            if (!event.is_deleted) await recall.removeCalendarEventBot(event.id).catch(() => undefined);
          } else {
            skip(decision.reason);
          }
        }
        if (!newest || event.updated_at > newest) newest = event.updated_at;
      } catch (e) {
        // Leave the cursor before this event so the next sync retries it.
        result.failed++;
        log.warn(`couldn't schedule event ${event.id}: ${(e as Error).message}`);
        break;
      }
    }
    if (newest && newest !== link.syncedThrough && result.failed === 0) await store.setSynced(link.id, newest);
    log.info(`synced calendar: ${result.scheduled} scheduled, ${result.cancelled} cancelled, ${result.failed} failed`);
    return result;
  }

  /** Syncs of one calendar never overlap, so a webhook and the reconcile timer can't double-schedule. */
  return function sync(recallCalendarId: string) {
    const prev = chains.get(recallCalendarId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => run(recallCalendarId));
    chains.set(recallCalendarId, next);
    void next
      .finally(() => chains.get(recallCalendarId) === next && chains.delete(recallCalendarId))
      .catch(() => undefined);
    return next;
  };
}
