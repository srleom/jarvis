// Functions the orchestrator server calls over ConvexHttpClient.
// Every function takes the shared ORCHESTRATOR_SECRET so the public dashboard can't call them.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, mutation, query, type MutationCtx } from "./_generated/server";
import { getActiveMeeting } from "./agents";
import { avatarStateValue, boardColumn, relayStatus, toolLogEntry } from "./schema";

function assertSecret(secret: string) {
  const expected = env.ORCHESTRATOR_SECRET;
  if (!expected || secret !== expected) throw new ConvexError("Unauthorized");
}

const secret = v.string();

export const meetingContext = query({
  args: { secret, meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const meeting = await ctx.db.get("meetings", args.meetingId);
    if (!meeting) return null;
    const agent = await ctx.db.get("agents", meeting.agentId);
    if (!agent) return null;
    return { meeting, agent };
  },
});

export const agentName = query({
  args: { secret, agentId: v.id("agents") },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return (await ctx.db.get("agents", args.agentId))?.name ?? null;
  },
});

export const meetingByBotId = query({
  args: { secret, recallBotId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return await ctx.db
      .query("meetings")
      .withIndex("by_recallBotId", (q) => q.eq("recallBotId", args.recallBotId))
      .first();
  },
});

export const activeMeetings = query({
  args: { secret },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const live = await ctx.db
      .query("meetings")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .take(100);
    const joining = await ctx.db
      .query("meetings")
      .withIndex("by_status", (q) => q.eq("status", "joining"))
      .take(100);
    return [...live, ...joining];
  },
});

export const setBot = mutation({
  args: { secret, meetingId: v.id("meetings"), recallBotId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    await ctx.db.patch("meetings", args.meetingId, { recallBotId: args.recallBotId });
  },
});

export const setStatus = mutation({
  args: {
    secret,
    meetingId: v.id("meetings"),
    status: v.union(v.literal("joining"), v.literal("live"), v.literal("ended"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const meeting = await ctx.db.get("meetings", args.meetingId);
    if (!meeting) return;
    if (meeting.status === "ended" || meeting.status === "failed" || meeting.status === "cancelled") return;
    if (args.status === "joining") {
      // A calendar bot has started joining: the agent is now busy.
      if (meeting.status === "scheduled") {
        await ctx.db.patch("meetings", args.meetingId, { status: "joining", startedAt: Date.now() });
      }
      return;
    }
    if (args.status === "live") {
      if (meeting.status === "joining" || meeting.status === "scheduled") {
        await ctx.db.patch("meetings", args.meetingId, { status: "live", startedAt: Date.now() });
      }
      return;
    }
    if (args.status === "failed") {
      await ctx.db.patch("meetings", args.meetingId, {
        status: "failed",
        error: args.error,
        endedAt: Date.now(),
      });
      return;
    }
    await ctx.runMutation(internal.meetings.finish, { meetingId: args.meetingId });
    await expireOpenRelays(ctx, args.meetingId);
    await setAvatarState(ctx, args.meetingId, "listening");
  },
});

async function expireOpenRelays(ctx: MutationCtx, meetingId: Id<"meetings">) {
  const relays = await ctx.db
    .query("relayRequests")
    .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
    .take(200);
  for (const r of relays) {
    if (r.status !== "answered" && r.status !== "expired") {
      await ctx.db.patch("relayRequests", r._id, { status: "expired", updatedAt: Date.now() });
    }
  }
}

export const addTranscript = mutation({
  args: {
    secret,
    meetingId: v.id("meetings"),
    speaker: v.string(),
    text: v.string(),
    startTime: v.number(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return await ctx.db.insert("transcriptSegments", {
      meetingId: args.meetingId,
      speaker: args.speaker,
      text: args.text,
      startTime: args.startTime,
      isFinal: true,
    });
  },
});

export const board = query({
  args: { secret, meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return await ctx.db
      .query("boardNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .take(500);
  },
});

const boardOp = v.union(
  v.object({
    op: v.literal("add"),
    column: boardColumn,
    text: v.string(),
    owner: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  }),
  v.object({
    op: v.literal("update"),
    id: v.string(),
    text: v.optional(v.string()),
    owner: v.optional(v.string()),
  }),
  v.object({ op: v.literal("move"), id: v.string(), column: boardColumn }),
  v.object({ op: v.literal("remove"), id: v.string() }),
);

/** Applies a whiteboard update in one transaction. Unknown or foreign note ids are ignored. */
export const applyBoardOps = mutation({
  args: { secret, meetingId: v.id("meetings"), ops: v.array(boardOp) },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const now = Date.now();
    let applied = 0;
    for (const op of args.ops.slice(0, 5)) {
      if (op.op === "add") {
        const text = op.text.trim();
        if (!text) continue;
        await ctx.db.insert("boardNotes", {
          meetingId: args.meetingId,
          column: op.column,
          text,
          owner: op.owner?.trim() || undefined,
          sourceUrl: op.sourceUrl,
          createdAt: now,
          updatedAt: now,
        });
        applied++;
        continue;
      }
      const id = ctx.db.normalizeId("boardNotes", op.id);
      if (!id) continue;
      const note = await ctx.db.get("boardNotes", id);
      if (!note || note.meetingId !== args.meetingId) continue;
      if (op.op === "remove") {
        await ctx.db.delete("boardNotes", id);
      } else if (op.op === "move") {
        await ctx.db.patch("boardNotes", id, { column: op.column, updatedAt: now });
      } else {
        await ctx.db.patch("boardNotes", id, {
          ...(op.text?.trim() ? { text: op.text.trim() } : {}),
          ...(op.owner !== undefined ? { owner: op.owner.trim() || undefined } : {}),
          updatedAt: now,
        });
      }
      applied++;
    }
    return applied;
  },
});

export const addAnswer = mutation({
  args: {
    secret,
    meetingId: v.id("meetings"),
    askedBy: v.string(),
    question: v.string(),
    spokenAnswer: v.string(),
    boardNote: v.string(),
    sourceUrl: v.optional(v.string()),
    toolLog: v.array(toolLogEntry),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const now = Date.now();
    await ctx.db.insert("answers", {
      meetingId: args.meetingId,
      askedBy: args.askedBy,
      question: args.question,
      spokenAnswer: args.spokenAnswer,
      sourceUrl: args.sourceUrl,
      toolLog: args.toolLog,
      createdAt: now,
    });
    if (args.boardNote.trim()) {
      await ctx.db.insert("boardNotes", {
        meetingId: args.meetingId,
        column: "answers",
        text: args.boardNote.trim(),
        sourceUrl: args.sourceUrl,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

async function setAvatarState(
  ctx: MutationCtx,
  meetingId: Id<"meetings">,
  state: "listening" | "thinking" | "hand_raised" | "speaking",
  preview?: string,
) {
  const existing = await ctx.db
    .query("avatarState")
    .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
    .first();
  if (existing) {
    if (existing.state === state && existing.preview === preview) return;
    await ctx.db.patch("avatarState", existing._id, { state, preview });
  } else {
    await ctx.db.insert("avatarState", { meetingId, state, preview });
  }
}

export const setAvatar = mutation({
  args: {
    secret,
    meetingId: v.id("meetings"),
    state: avatarStateValue,
    preview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    await setAvatarState(ctx, args.meetingId, args.state, args.preview);
  },
});

export const createRelay = mutation({
  args: {
    secret,
    meetingId: v.id("meetings"),
    fromSlackUserId: v.string(),
    fromName: v.string(),
    message: v.string(),
    preview: v.string(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const now = Date.now();
    return await ctx.db.insert("relayRequests", {
      meetingId: args.meetingId,
      fromSlackUserId: args.fromSlackUserId,
      fromName: args.fromName,
      message: args.message,
      preview: args.preview,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateRelay = mutation({
  args: {
    secret,
    relayId: v.id("relayRequests"),
    status: relayStatus,
    teamAnswer: v.optional(v.string()),
    slackReply: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    await ctx.db.patch("relayRequests", args.relayId, {
      status: args.status,
      ...(args.teamAnswer !== undefined ? { teamAnswer: args.teamAnswer } : {}),
      ...(args.slackReply !== undefined ? { slackReply: args.slackReply } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const appendMossDocIds = mutation({
  args: { secret, meetingId: v.id("meetings"), ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const meeting = await ctx.db.get("meetings", args.meetingId);
    if (!meeting) return;
    await ctx.db.patch("meetings", args.meetingId, {
      mossDocIds: [...meeting.mossDocIds, ...args.ids],
    });
  },
});

/** Agents whose Team tab includes this Slack user, with their live meeting and most recent meeting. */
export const agentsForSlackUser = query({
  args: { secret, slackUserId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_slackUserId", (q) => q.eq("slackUserId", args.slackUserId))
      .take(50);
    const results = [];
    for (const m of memberships) {
      const agent = await ctx.db.get("agents", m.agentId);
      if (!agent) continue;
      const active = await getActiveMeeting(ctx, agent._id);
      const latest = await ctx.db
        .query("meetings")
        .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
        .order("desc")
        .first();
      results.push({
        agent,
        memberName: m.name,
        liveMeetingId: active?.status === "live" ? active._id : null,
        latestMeetingId: latest?._id ?? null,
        latestMeetingAt: latest?.startedAt ?? 0,
      });
    }
    return results;
  },
});

/** Everything needed to summarise a meeting for Slack: board, transcript tail, notes. */
export const meetingDigest = query({
  args: { secret, meetingId: v.id("meetings"), transcriptLimit: v.number() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const meeting = await ctx.db.get("meetings", args.meetingId);
    if (!meeting) return null;
    const board = await ctx.db
      .query("boardNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .take(500);
    const transcript = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .order("desc")
      .take(args.transcriptLimit);
    const notes = await ctx.db
      .query("meetingNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .first();
    return { meeting, board, transcript: transcript.reverse(), notes };
  },
});

// ------------------------------------------------------------------ webhooks and calendar scheduling

/** True the first time a Recall webhook message id is seen. Retries of the same message get false. */
export const claimWebhook = mutation({
  args: { secret, eventId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (seen) return false;
    await ctx.db.insert("webhookEvents", { eventId: args.eventId, createdAt: Date.now() });
    return true;
  },
});

export const calendarLinks = query({
  args: { secret },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return await ctx.db.query("calendarLinks").take(100);
  },
});

export const calendarLinkByCalendarId = query({
  args: { secret, recallCalendarId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return await ctx.db
      .query("calendarLinks")
      .withIndex("by_recallCalendarId", (q) => q.eq("recallCalendarId", args.recallCalendarId))
      .first();
  },
});

export const setCalendarSynced = mutation({
  args: { secret, linkId: v.id("calendarLinks"), syncedThrough: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    await ctx.db.patch("calendarLinks", args.linkId, { syncedThrough: args.syncedThrough });
  },
});

/**
 * Records the intent to record a calendar event before Recall is asked to schedule the bot.
 * Idempotent per event: a re-sync updates the existing scheduled meeting instead of adding another.
 */
export const scheduleCalendarMeeting = mutation({
  args: {
    secret,
    agentId: v.id("agents"),
    calendarEventId: v.string(),
    meetUrl: v.string(),
    title: v.optional(v.string()),
    scheduledFor: v.number(),
    scheduledEnd: v.number(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const agent = await ctx.db.get("agents", args.agentId);
    if (!agent) return { kind: "skipped" as const, reason: "agent_missing" };

    const existing = await ctx.db
      .query("meetings")
      .withIndex("by_calendarEventId", (q) => q.eq("calendarEventId", args.calendarEventId))
      .first();
    if (existing) {
      if (existing.status === "cancelled") return { kind: "skipped" as const, reason: "cancelled" };
      if (existing.status !== "scheduled") return { kind: "skipped" as const, reason: "already_started" };
      await ctx.db.patch("meetings", existing._id, {
        meetUrl: args.meetUrl,
        title: args.title,
        startedAt: args.scheduledFor,
        scheduledFor: args.scheduledFor,
        scheduledEnd: args.scheduledEnd,
      });
      return { kind: "scheduled" as const, meetingId: existing._id };
    }

    // One agent can only be in one call at a time, so the first overlapping event wins.
    const others = await ctx.db
      .query("meetings")
      .withIndex("by_agent_and_status", (q) => q.eq("agentId", args.agentId).eq("status", "scheduled"))
      .take(100);
    const clash = others.find(
      (m) => (m.scheduledFor ?? 0) < args.scheduledEnd && (m.scheduledEnd ?? 0) > args.scheduledFor,
    );
    if (clash) return { kind: "skipped" as const, reason: "overlaps_another_meeting" };

    const meetingId = await ctx.db.insert("meetings", {
      agentId: args.agentId,
      meetUrl: args.meetUrl,
      title: args.title,
      status: "scheduled",
      source: "calendar",
      calendarEventId: args.calendarEventId,
      scheduledFor: args.scheduledFor,
      scheduledEnd: args.scheduledEnd,
      mossDocIds: [],
      startedAt: args.scheduledFor,
    });
    await ctx.db.insert("avatarState", { meetingId, state: "listening" });
    await ctx.db.patch("agents", agent._id, { meetingCount: agent.meetingCount + 1 });
    return { kind: "scheduled" as const, meetingId };
  },
});

/** Drops a scheduled meeting that never got a bot (Recall refused the request). */
export const discardScheduled = mutation({
  args: { secret, meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const meeting = await ctx.db.get("meetings", args.meetingId);
    if (!meeting || meeting.status !== "scheduled" || meeting.recallBotId) return;
    await ctx.db.delete("meetings", meeting._id);
    await ctx.scheduler.runAfter(0, internal.cleanup.meetingData, { meetingId: meeting._id });
    const agent = await ctx.db.get("agents", meeting.agentId);
    if (agent) await ctx.db.patch("agents", agent._id, { meetingCount: Math.max(0, agent.meetingCount - 1) });
  },
});

/** The calendar event was deleted, or no longer qualifies: stop planning to join it. */
export const cancelCalendarMeeting = mutation({
  args: { secret, calendarEventId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const meeting = await ctx.db
      .query("meetings")
      .withIndex("by_calendarEventId", (q) => q.eq("calendarEventId", args.calendarEventId))
      .first();
    if (!meeting || meeting.status !== "scheduled") return null;
    await ctx.db.patch("meetings", meeting._id, { status: "cancelled", endedAt: Date.now() });
    return meeting._id;
  },
});
