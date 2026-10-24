import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const forNotes = internalQuery({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    const meeting = await ctx.db.get("meetings", meetingId);
    if (!meeting) return null;
    const agent = await ctx.db.get("agents", meeting.agentId);
    if (!agent) return null;
    const [transcript, board, answers, relays, existing] = await Promise.all([
      ctx.db.query("transcriptSegments").withIndex("by_meeting", (q) => q.eq("meetingId", meetingId)).take(5000),
      ctx.db.query("boardNotes").withIndex("by_meeting", (q) => q.eq("meetingId", meetingId)).take(500),
      ctx.db.query("answers").withIndex("by_meeting", (q) => q.eq("meetingId", meetingId)).take(200),
      ctx.db.query("relayRequests").withIndex("by_meeting", (q) => q.eq("meetingId", meetingId)).take(200),
      ctx.db
        .query("meetingNotes")
        .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
        .first(),
    ]);
    return { meeting, agent, transcript, board, answers, relays, hasNotes: existing !== null };
  },
});

export const save = internalMutation({
  args: {
    meetingId: v.id("meetings"),
    title: v.string(),
    markdown: v.string(),
    slackMessageTs: v.optional(v.string()),
    mossDocIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get("meetings", args.meetingId);
    if (!meeting) return false;
    const existing = await ctx.db
      .query("meetingNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .first();
    if (existing) return false;
    await ctx.db.insert("meetingNotes", {
      meetingId: args.meetingId,
      agentId: meeting.agentId,
      markdown: args.markdown,
      slackMessageTs: args.slackMessageTs,
      createdAt: Date.now(),
    });
    await ctx.db.patch("meetings", args.meetingId, {
      title: args.title,
      mossDocIds: [...meeting.mossDocIds, ...args.mossDocIds],
    });
    return true;
  },
});
