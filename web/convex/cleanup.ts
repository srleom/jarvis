import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const BATCH = 200;

/** Deletes everything that hangs off a deleted agent, in batches. */
export const agentData = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .take(BATCH);
    for (const m of members) await ctx.db.delete("teamMembers", m._id);

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .take(BATCH);
    for (const d of docs) {
      await ctx.storage.delete(d.storageId);
      await ctx.db.delete("documents", d._id);
    }

    const facts = await ctx.db
      .query("stateFacts")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .take(BATCH);
    for (const f of facts) await ctx.db.delete("stateFacts", f._id);

    const proposals = await ctx.db
      .query("stateProposals")
      .withIndex("by_agent_and_status", (q) => q.eq("agentId", agentId))
      .take(BATCH);
    for (const p of proposals) await ctx.db.delete("stateProposals", p._id);

    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .take(50);
    for (const m of meetings) {
      await ctx.db.delete("meetings", m._id);
      await ctx.scheduler.runAfter(0, internal.cleanup.meetingData, {
        meetingId: m._id,
      });
    }

    if (
      members.length === BATCH ||
      docs.length === BATCH ||
      facts.length === BATCH ||
      proposals.length === BATCH ||
      meetings.length === 50
    ) {
      await ctx.scheduler.runAfter(0, internal.cleanup.agentData, { agentId });
    }
  },
});

/** Deletes transcript, board, answers, relays, avatar and notes for a deleted meeting. */
export const meetingData = internalMutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    let more = false;
    const tables = [
      "transcriptSegments",
      "boardNotes",
      "boardTopics",
      "answers",
      "relayRequests",
      "avatarState",
      "meetingNotes",
    ] as const;
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
        .take(BATCH);
      for (const row of rows) await ctx.db.delete(table, row._id);
      if (rows.length === BATCH) more = true;
    }
    if (more) {
      await ctx.scheduler.runAfter(0, internal.cleanup.meetingData, {
        meetingId,
      });
    }
  },
});
