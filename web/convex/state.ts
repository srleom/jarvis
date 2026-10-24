import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { stateChangeKind } from "./schema";

const MAX_FACT_CHARS = 400;

function cleanFact(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new ConvexError("Write the fact first.");
  if (trimmed.length > MAX_FACT_CHARS) throw new ConvexError(`Keep it under ${MAX_FACT_CHARS} characters.`);
  return trimmed;
}

function shortDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Upserts a fact into the agent's memory index so search and the in-call lookup can find it. */
async function indexFact(ctx: MutationCtx, indexName: string, fact: Doc<"stateFacts">) {
  if (!indexName) return;
  await ctx.scheduler.runAfter(0, internal.memory.addDocs, {
    indexName,
    docs: [
      {
        id: `state:${fact._id}`,
        text: `Project state: ${fact.text}`,
        metadata: {
          source: "state",
          date: shortDate(fact.updatedAt),
          ts: String(fact.updatedAt),
          factId: fact._id,
        },
      },
    ],
  });
}

async function unindexFact(ctx: MutationCtx, indexName: string, factId: Id<"stateFacts">) {
  if (!indexName) return;
  await ctx.scheduler.runAfter(0, internal.memory.deleteDocs, {
    indexName,
    docIds: [`state:${factId}`],
  });
}

export const list = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const facts = await ctx.db
      .query("stateFacts")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(200);
    return await Promise.all(
      facts.map(async (f) => {
        const meeting = f.sourceMeetingId ? await ctx.db.get("meetings", f.sourceMeetingId) : null;
        return {
          ...f,
          sourceMeeting: meeting ? { _id: meeting._id, title: meeting.title ?? "Untitled meeting" } : null,
        };
      }),
    );
  },
});

/** Proposed changes waiting for review, newest meeting first. */
export const pending = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const proposals = await ctx.db
      .query("stateProposals")
      .withIndex("by_agent_and_status", (q) => q.eq("agentId", agentId).eq("status", "pending"))
      .order("desc")
      .take(100);
    return await Promise.all(
      proposals.map(async (p) => {
        const meeting = await ctx.db.get("meetings", p.meetingId);
        return {
          ...p,
          meeting: {
            _id: p.meetingId,
            title: meeting?.title ?? "Untitled meeting",
            startedAt: meeting?.startedAt ?? p.createdAt,
          },
        };
      }),
    );
  },
});

export const pendingCount = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const proposals = await ctx.db
      .query("stateProposals")
      .withIndex("by_agent_and_status", (q) => q.eq("agentId", agentId).eq("status", "pending"))
      .take(100);
    return proposals.length;
  },
});

/** Everything proposed after one meeting, including what was already accepted or dismissed. */
export const forMeeting = query({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    return await ctx.db
      .query("stateProposals")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .take(50);
  },
});

export const addFact = mutation({
  args: { agentId: v.id("agents"), text: v.string() },
  handler: async (ctx, { agentId, text }) => {
    const agent = await ctx.db.get("agents", agentId);
    if (!agent) throw new ConvexError("Agent not found.");
    const now = Date.now();
    const factId = await ctx.db.insert("stateFacts", {
      agentId,
      text: cleanFact(text),
      createdAt: now,
      updatedAt: now,
    });
    const fact = await ctx.db.get("stateFacts", factId);
    if (fact) await indexFact(ctx, agent.mossIndexName, fact);
  },
});

export const editFact = mutation({
  args: { factId: v.id("stateFacts"), text: v.string() },
  handler: async (ctx, { factId, text }) => {
    const fact = await ctx.db.get("stateFacts", factId);
    if (!fact) return;
    const agent = await ctx.db.get("agents", fact.agentId);
    await ctx.db.patch("stateFacts", factId, { text: cleanFact(text), updatedAt: Date.now() });
    const next = await ctx.db.get("stateFacts", factId);
    if (agent && next) await indexFact(ctx, agent.mossIndexName, next);
  },
});

export const removeFact = mutation({
  args: { factId: v.id("stateFacts") },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.db.get("stateFacts", factId);
    if (!fact) return;
    const agent = await ctx.db.get("agents", fact.agentId);
    await ctx.db.delete("stateFacts", factId);
    if (agent) await unindexFact(ctx, agent.mossIndexName, factId);
  },
});

async function applyProposal(ctx: MutationCtx, proposal: Doc<"stateProposals">, textOverride?: string) {
  if (proposal.status !== "pending") return;
  const agent = await ctx.db.get("agents", proposal.agentId);
  if (!agent) throw new ConvexError("Agent not found.");
  const now = Date.now();
  const existing = proposal.factId ? await ctx.db.get("stateFacts", proposal.factId) : null;

  if (proposal.kind === "remove") {
    if (existing) {
      await ctx.db.delete("stateFacts", existing._id);
      await unindexFact(ctx, agent.mossIndexName, existing._id);
    }
  } else {
    const text = cleanFact(textOverride ?? proposal.text);
    // An update whose fact was deleted since falls back to adding it.
    if (proposal.kind === "update" && existing) {
      await ctx.db.patch("stateFacts", existing._id, {
        text,
        sourceMeetingId: proposal.meetingId,
        updatedAt: now,
      });
      const next = await ctx.db.get("stateFacts", existing._id);
      if (next) await indexFact(ctx, agent.mossIndexName, next);
    } else {
      const factId = await ctx.db.insert("stateFacts", {
        agentId: proposal.agentId,
        text,
        sourceMeetingId: proposal.meetingId,
        createdAt: now,
        updatedAt: now,
      });
      const fact = await ctx.db.get("stateFacts", factId);
      if (fact) await indexFact(ctx, agent.mossIndexName, fact);
    }
  }
  await ctx.db.patch("stateProposals", proposal._id, { status: "accepted" });
}

/** Accepts a proposal, optionally with the reviewer's edit of the wording. */
export const accept = mutation({
  args: { proposalId: v.id("stateProposals"), text: v.optional(v.string()) },
  handler: async (ctx, { proposalId, text }) => {
    const proposal = await ctx.db.get("stateProposals", proposalId);
    if (proposal) await applyProposal(ctx, proposal, text);
  },
});

export const dismiss = mutation({
  args: { proposalId: v.id("stateProposals") },
  handler: async (ctx, { proposalId }) => {
    const proposal = await ctx.db.get("stateProposals", proposalId);
    if (proposal?.status === "pending") await ctx.db.patch("stateProposals", proposalId, { status: "dismissed" });
  },
});

/** Accepts every pending proposal from one meeting. */
export const acceptAll = mutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    const proposals = await ctx.db
      .query("stateProposals")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .take(50);
    for (const p of proposals) await applyProposal(ctx, p);
  },
});

/** What the proposal step needs to compare a finished meeting against the current state. */
export const forProposals = internalQuery({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    const meeting = await ctx.db.get("meetings", meetingId);
    if (!meeting) return null;
    const agent = await ctx.db.get("agents", meeting.agentId);
    if (!agent) return null;
    const [notes, board, topics, facts, already] = await Promise.all([
      ctx.db
        .query("meetingNotes")
        .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
        .first(),
      ctx.db
        .query("boardNotes")
        .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
        .take(500),
      ctx.db
        .query("boardTopics")
        .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
        .take(100),
      ctx.db
        .query("stateFacts")
        .withIndex("by_agent", (q) => q.eq("agentId", meeting.agentId))
        .order("desc")
        .take(200),
      ctx.db
        .query("stateProposals")
        .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
        .first(),
    ]);
    return { meeting, agent, notes, board, topics, facts, alreadyProposed: already !== null };
  },
});

export const insertProposals = internalMutation({
  args: {
    agentId: v.id("agents"),
    meetingId: v.id("meetings"),
    changes: v.array(
      v.object({
        kind: stateChangeKind,
        text: v.string(),
        factId: v.optional(v.id("stateFacts")),
        previousText: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { agentId, meetingId, changes }) => {
    const first = await ctx.db
      .query("stateProposals")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .first();
    if (first) return 0;
    const now = Date.now();
    for (const c of changes) {
      await ctx.db.insert("stateProposals", { agentId, meetingId, ...c, status: "pending", createdAt: now });
    }
    return changes.length;
  },
});
