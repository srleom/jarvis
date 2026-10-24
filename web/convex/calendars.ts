import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, mutation, query } from "./_generated/server";
import { callOrchestrator } from "./lib/orchestrator";

export const forAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("calendarLinks")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .take(20);
  },
});

/** Calendars connected in Recall, with the agent each one is linked to. */
export const available = action({
  args: {},
  handler: async () => {
    return await callOrchestrator<{
      calendars: {
        id: string;
        platform: string;
        platformEmail: string | null;
        status: string;
      }[];
    }>("/calendar/list", {});
  },
});

export const link = mutation({
  args: {
    agentId: v.id("agents"),
    recallCalendarId: v.string(),
    platformEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get("agents", args.agentId);
    if (!agent) throw new ConvexError("Agent not found.");
    const existing = await ctx.db
      .query("calendarLinks")
      .withIndex("by_recallCalendarId", (q) => q.eq("recallCalendarId", args.recallCalendarId))
      .first();
    if (existing) {
      if (existing.agentId === args.agentId) return existing._id;
      throw new ConvexError("That calendar is already linked to another agent.");
    }
    const id = await ctx.db.insert("calendarLinks", {
      agentId: args.agentId,
      recallCalendarId: args.recallCalendarId,
      platformEmail: args.platformEmail,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.calendars.sync, {
      recallCalendarId: args.recallCalendarId,
    });
    return id;
  },
});

/** Unlinking cancels the meetings that were scheduled from this calendar. */
export const unlink = mutation({
  args: { linkId: v.id("calendarLinks") },
  handler: async (ctx, { linkId }) => {
    const link = await ctx.db.get("calendarLinks", linkId);
    if (!link) return;
    const scheduled = await ctx.db
      .query("meetings")
      .withIndex("by_agent_and_status", (q) => q.eq("agentId", link.agentId).eq("status", "scheduled"))
      .take(200);
    for (const m of scheduled) {
      if (m.source !== "calendar") continue;
      await ctx.db.patch("meetings", m._id, {
        status: "cancelled",
        endedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.meetings.unscheduleBot, {
        meetingId: m._id,
      });
    }
    await ctx.db.delete("calendarLinks", linkId);
  },
});

export const sync = internalAction({
  args: { recallCalendarId: v.string() },
  handler: async (_ctx, { recallCalendarId }) => {
    try {
      await callOrchestrator("/calendar/sync", { recallCalendarId });
    } catch {
      // The orchestrator also reconciles every linked calendar on a timer.
    }
  },
});
