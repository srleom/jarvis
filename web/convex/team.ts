import { ConvexError, v } from "convex/values";
import { action, mutation, query, env } from "./_generated/server";

export const list = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("teamMembers")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .take(200);
  },
});

export const add = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.string(),
    slackUserId: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get("agents", args.agentId);
    if (!agent) throw new ConvexError("Agent not found.");
    const slackUserId = args.slackUserId.trim();
    const name = args.name.trim();
    if (!slackUserId || !name) throw new ConvexError("Name and Slack user are required.");
    const existing = await ctx.db
      .query("teamMembers")
      .withIndex("by_agent_and_slackUserId", (q) =>
        q.eq("agentId", args.agentId).eq("slackUserId", slackUserId),
      )
      .unique();
    if (existing) throw new ConvexError(`${existing.name} is already on the team.`);
    await ctx.db.insert("teamMembers", {
      agentId: args.agentId,
      name,
      slackUserId,
      avatarUrl: args.avatarUrl,
    });
    await ctx.db.patch("agents", args.agentId, { memberCount: agent.memberCount + 1 });
  },
});

export const remove = mutation({
  args: { memberId: v.id("teamMembers") },
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get("teamMembers", memberId);
    if (!member) return;
    await ctx.db.delete("teamMembers", memberId);
    const agent = await ctx.db.get("agents", member.agentId);
    if (agent) {
      await ctx.db.patch("agents", agent._id, {
        memberCount: Math.max(0, agent.memberCount - 1),
      });
    }
  },
});

type SlackMember = {
  id: string;
  name: string;
  deleted?: boolean;
  is_bot?: boolean;
  real_name?: string;
  profile?: { display_name?: string; real_name?: string; image_72?: string };
};

/** Lists people in the Slack workspace so the Team tab can pick from them. */
export const listSlackUsers = action({
  args: {},
  handler: async () => {
    const token = env.SLACK_BOT_TOKEN;
    if (!token) {
      throw new ConvexError(
        "Slack isn't connected yet. Set SLACK_BOT_TOKEN on the Convex deployment, or add members manually.",
      );
    }
    const users: { id: string; name: string; handle: string; avatarUrl?: string }[] = [];
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ limit: "200" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://slack.com/api/users.list?${params}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        members?: SlackMember[];
        response_metadata?: { next_cursor?: string };
      };
      if (!data.ok) throw new ConvexError(`Slack error: ${data.error ?? "unknown"}`);
      for (const m of data.members ?? []) {
        if (m.deleted || m.is_bot || m.id === "USLACKBOT") continue;
        users.push({
          id: m.id,
          name: m.profile?.real_name || m.real_name || m.profile?.display_name || m.name,
          handle: m.profile?.display_name || m.name,
          avatarUrl: m.profile?.image_72,
        });
      }
      cursor = data.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }
    return users.sort((a, b) => a.name.localeCompare(b.name));
  },
});
