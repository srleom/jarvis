import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, query } from "./_generated/server";
import { callOrchestrator } from "./lib/orchestrator";

// Moss runs inside the orchestrator (its SDK is a native Node module), so these
// actions forward to the orchestrator's memory endpoints.

export type MemoryHit = {
  id: string;
  text: string;
  score: number;
  source: "doc" | "transcript" | "notes";
  label: string;
  meetingId?: string;
};

export const indexDocument = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const info = await ctx.runQuery(internal.documents.getForIndexing, {
      documentId,
    });
    if (!info || !info.url) return;
    try {
      const result = await callOrchestrator<{ docIds: string[] }>("/memory/index-document", {
        indexName: info.indexName,
        documentId,
        fileName: info.doc.fileName,
        contentType: info.doc.contentType,
        url: info.url,
      });
      await ctx.runMutation(internal.documents.setIndexResult, {
        documentId,
        indexName: info.indexName,
        ok: true,
        mossDocIds: result.docIds,
      });
    } catch (e) {
      await ctx.runMutation(internal.documents.setIndexResult, {
        documentId,
        indexName: info.indexName,
        ok: false,
        error: e instanceof Error ? e.message : "Indexing failed",
      });
    }
  },
});

export const deleteDocs = internalAction({
  args: { indexName: v.string(), docIds: v.array(v.string()) },
  handler: async (_ctx, args) => {
    try {
      await callOrchestrator("/memory/delete-docs", args);
    } catch (e) {
      console.error("Moss delete failed", e);
    }
  },
});

export const deleteIndex = internalAction({
  args: { indexName: v.string() },
  handler: async (_ctx, args) => {
    try {
      await callOrchestrator("/memory/delete-index", args);
    } catch (e) {
      console.error("Moss index delete failed", e);
    }
  },
});

export const addDocs = internalAction({
  args: {
    indexName: v.string(),
    docs: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        metadata: v.record(v.string(), v.string()),
      }),
    ),
  },
  handler: async (_ctx, args) => {
    await callOrchestrator("/memory/add-docs", args);
  },
});

/** The same memory search Jarvis runs during a call. */
export const search = action({
  args: { agentId: v.id("agents"), query: v.string() },
  handler: async (ctx, { agentId, query }): Promise<MemoryHit[]> => {
    const agent = await ctx.runQuery(internal.meetings.agentForAction, {
      agentId,
    });
    if (!agent) throw new ConvexError("Agent not found.");
    if (!query.trim()) return [];
    try {
      const result = await callOrchestrator<{ hits: MemoryHit[] }>("/memory/search", {
        indexName: agent.mossIndexName,
        query: query.trim(),
        topK: 5,
      });
      return result.hits;
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Search failed");
    }
  },
});

/** Past meeting notes this agent can draw on. */
export const pastNotes = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const notes = await ctx.db
      .query("meetingNotes")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(50);
    return await Promise.all(
      notes.map(async (n) => {
        const meeting = await ctx.db.get("meetings", n.meetingId);
        return {
          _id: n._id,
          meetingId: n.meetingId,
          title: meeting?.title ?? "Untitled meeting",
          startedAt: meeting?.startedAt ?? n.createdAt,
          preview: n.markdown
            .replace(/^#+\s.*$/gm, "")
            .replace(/[#*_>`-]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 180),
        };
      }),
    );
  },
});
