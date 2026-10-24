import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getActiveMeeting } from "./agents";
import { callOrchestrator } from "./lib/orchestrator";

const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4}(\?.*)?$/i;

export function normalizeMeetUrl(raw: string) {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/^http:\/\//i, "https://");
  if (!MEET_URL.test(url)) {
    throw new ConvexError("That doesn't look like a Google Meet link (meet.google.com/abc-defg-hij).");
  }
  return url;
}

export const send = mutation({
  args: { agentId: v.id("agents"), meetUrl: v.string() },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get("agents", args.agentId);
    if (!agent) throw new ConvexError("Agent not found.");
    const meetUrl = normalizeMeetUrl(args.meetUrl);
    const active = await getActiveMeeting(ctx, args.agentId);
    if (active) throw new ConvexError(`${agent.name} is already in a meeting.`);

    const meetingId = await ctx.db.insert("meetings", {
      agentId: args.agentId,
      meetUrl,
      status: "joining",
      mossDocIds: [],
      startedAt: Date.now(),
    });
    await ctx.db.insert("avatarState", { meetingId, state: "listening" });
    await ctx.db.patch("agents", agent._id, { meetingCount: agent.meetingCount + 1 });
    await ctx.scheduler.runAfter(0, internal.meetings.startBot, { meetingId });
    return meetingId;
  },
});

export const startBot = internalAction({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    try {
      await callOrchestrator("/meetings/start", { meetingId });
    } catch (e) {
      await ctx.runMutation(internal.meetings.markFailed, {
        meetingId,
        error: e instanceof Error ? e.message : "Couldn't start the bot.",
      });
    }
  },
});

export const markFailed = internalMutation({
  args: { meetingId: v.id("meetings"), error: v.string() },
  handler: async (ctx, { meetingId, error }) => {
    const meeting = await ctx.db.get("meetings", meetingId);
    if (!meeting || meeting.status === "ended") return;
    await ctx.db.patch("meetings", meetingId, {
      status: "failed",
      error,
      endedAt: Date.now(),
    });
  },
});

/** Asks the bot to leave. The end-of-call webhook then finishes the meeting. */
export const leave = mutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    const meeting = await ctx.db.get("meetings", meetingId);
    if (!meeting) return;
    if (meeting.status === "joining" && !meeting.recallBotId) {
      await ctx.db.patch("meetings", meetingId, {
        status: "failed",
        error: "Cancelled before joining.",
        endedAt: Date.now(),
      });
      return;
    }
    await ctx.scheduler.runAfter(0, internal.meetings.stopBot, { meetingId });
  },
});

export const stopBot = internalAction({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    try {
      await callOrchestrator("/meetings/stop", { meetingId });
    } catch (e) {
      // If the orchestrator is gone, end the meeting here so the agent isn't stuck "in a meeting".
      await ctx.runMutation(internal.meetings.finish, {
        meetingId,
        reason: e instanceof Error ? e.message : "stop failed",
      });
    }
  },
});

export const finish = internalMutation({
  args: { meetingId: v.id("meetings"), reason: v.optional(v.string()) },
  handler: async (ctx, { meetingId }) => {
    const meeting = await ctx.db.get("meetings", meetingId);
    if (!meeting || meeting.status === "ended" || meeting.status === "failed") return;
    await ctx.db.patch("meetings", meetingId, { status: "ended", endedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.notes.generate, { meetingId });
  },
});

export const remove = mutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    const meeting = await ctx.db.get("meetings", meetingId);
    if (!meeting) return;
    if (meeting.status === "live" || meeting.status === "joining") {
      throw new ConvexError("Remove the agent from the call before deleting this meeting.");
    }
    const agent = await ctx.db.get("agents", meeting.agentId);
    await ctx.db.delete("meetings", meetingId);
    await ctx.scheduler.runAfter(0, internal.cleanup.meetingData, { meetingId });
    if (agent) {
      await ctx.db.patch("agents", agent._id, {
        meetingCount: Math.max(0, agent.meetingCount - 1),
      });
      if (meeting.mossDocIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.memory.deleteDocs, {
          indexName: agent.mossIndexName,
          docIds: meeting.mossDocIds,
        });
      }
    }
  },
});

export const listByAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("meetings")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    const meeting = await ctx.db.get("meetings", meetingId);
    if (!meeting) return null;
    const agent = await ctx.db.get("agents", meeting.agentId);
    const notes = await ctx.db
      .query("meetingNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .first();
    return { meeting, agentName: agent?.name ?? "Jarvis", notes };
  },
});

export const board = query({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    return await ctx.db
      .query("boardNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .take(500);
  },
});

export const avatar = query({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    return await ctx.db
      .query("avatarState")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .first();
  },
});

export const transcript = query({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    return await ctx.db
      .query("transcriptSegments")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .take(5000);
  },
});

export const answers = query({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    return await ctx.db
      .query("answers")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .take(200);
  },
});

export const relays = query({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    return await ctx.db
      .query("relayRequests")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .take(200);
  },
});

export const agentForAction = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => await ctx.db.get("agents", agentId),
});
