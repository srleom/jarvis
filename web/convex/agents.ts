import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { DEFAULT_BEHAVIOUR_INSTRUCTIONS, DEFAULT_POST_MEETING_INSTRUCTIONS } from "./lib/constants";

export async function getActiveMeeting(ctx: QueryCtx, agentId: Id<"agents">): Promise<Doc<"meetings"> | null> {
  const live = await ctx.db
    .query("meetings")
    .withIndex("by_agent_and_status", (q) => q.eq("agentId", agentId).eq("status", "live"))
    .first();
  if (live) return live;
  return await ctx.db
    .query("meetings")
    .withIndex("by_agent_and_status", (q) => q.eq("agentId", agentId).eq("status", "joining"))
    .first();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").order("desc").take(100);
    return await Promise.all(
      agents.map(async (agent) => {
        const active = await getActiveMeeting(ctx, agent._id);
        return {
          ...agent,
          activeMeeting: active ? { _id: active._id, status: active.status } : null,
        };
      }),
    );
  },
});

export const get = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get("agents", agentId);
    if (!agent) return null;
    const active = await getActiveMeeting(ctx, agentId);
    return {
      ...agent,
      activeMeeting: active ? { _id: active._id, status: active.status, meetUrl: active.meetUrl } : null,
    };
  },
});

function cleanName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new ConvexError("Give the agent a name.");
  if (trimmed.length > 32) throw new ConvexError("Keep the name under 32 characters.");
  return trimmed;
}

export const create = mutation({
  args: { name: v.string(), slackChannelId: v.string() },
  handler: async (ctx, args) => {
    const name = cleanName(args.name);
    const agentId = await ctx.db.insert("agents", {
      name,
      slackChannelId: args.slackChannelId.trim(),
      behaviourInstructions: DEFAULT_BEHAVIOUR_INSTRUCTIONS,
      postMeetingInstructions: DEFAULT_POST_MEETING_INSTRUCTIONS,
      mossIndexName: "",
      memberCount: 0,
      meetingCount: 0,
      createdAt: Date.now(),
    });
    await ctx.db.patch("agents", agentId, {
      mossIndexName: `jarvis-${agentId}`,
    });
    return agentId;
  },
});

export const update = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.optional(v.string()),
    slackChannelId: v.optional(v.string()),
    behaviourInstructions: v.optional(v.string()),
    postMeetingInstructions: v.optional(v.string()),
  },
  handler: async (ctx, { agentId, ...fields }) => {
    const agent = await ctx.db.get("agents", agentId);
    if (!agent) throw new ConvexError("Agent not found.");
    const patch: Partial<Doc<"agents">> = {};
    if (fields.name !== undefined) patch.name = cleanName(fields.name);
    if (fields.slackChannelId !== undefined) patch.slackChannelId = fields.slackChannelId.trim();
    if (fields.behaviourInstructions !== undefined) patch.behaviourInstructions = fields.behaviourInstructions.trim();
    if (fields.postMeetingInstructions !== undefined)
      patch.postMeetingInstructions = fields.postMeetingInstructions.trim() || DEFAULT_POST_MEETING_INSTRUCTIONS;
    await ctx.db.patch("agents", agentId, patch);
  },
});

export const remove = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get("agents", agentId);
    if (!agent) return;
    const active = await getActiveMeeting(ctx, agentId);
    if (active) {
      throw new ConvexError("Remove the agent from its meeting before deleting it.");
    }
    await ctx.db.delete("agents", agentId);
    await ctx.scheduler.runAfter(0, internal.cleanup.agentData, { agentId });
    if (agent.mossIndexName) {
      await ctx.scheduler.runAfter(0, internal.memory.deleteIndex, {
        indexName: agent.mossIndexName,
      });
    }
  },
});
