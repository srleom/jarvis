import { api, convex, secret, type Id } from "./convex.js";
import type { CalendarStore } from "./calendar.js";

/** Convex-backed storage for calendar scheduling. */
export const convexCalendarStore: CalendarStore = {
  async getLink(recallCalendarId) {
    const link = await convex.query(api.orchestrator.calendarLinkByCalendarId, {
      secret,
      recallCalendarId,
    });
    return link
      ? {
          id: link._id,
          agentId: link.agentId,
          syncedThrough: link.syncedThrough,
        }
      : null;
  },
  async agentName(agentId) {
    const links = await convex.query(api.orchestrator.agentName, {
      secret,
      agentId: agentId as Id<"agents">,
    });
    return links ?? "Jarvis";
  },
  async setSynced(linkId, syncedThrough) {
    await convex.mutation(api.orchestrator.setCalendarSynced, {
      secret,
      linkId: linkId as Id<"calendarLinks">,
      syncedThrough,
    });
  },
  async schedule(args) {
    const r = await convex.mutation(api.orchestrator.scheduleCalendarMeeting, {
      secret,
      ...args,
      agentId: args.agentId as Id<"agents">,
    });
    return r.kind === "scheduled"
      ? { kind: "scheduled", meetingId: r.meetingId }
      : { kind: "skipped", reason: r.reason };
  },
  async recordBot(meetingId, botId) {
    await convex.mutation(api.orchestrator.setBot, {
      secret,
      meetingId: meetingId as Id<"meetings">,
      recallBotId: botId,
    });
  },
  async discard(meetingId) {
    await convex.mutation(api.orchestrator.discardScheduled, {
      secret,
      meetingId: meetingId as Id<"meetings">,
    });
  },
  async cancelByEvent(calendarEventId) {
    return await convex.mutation(api.orchestrator.cancelCalendarMeeting, {
      secret,
      calendarEventId,
    });
  },
};
