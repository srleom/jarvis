import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = /\.(pdf|md|markdown|txt)$/i;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const list = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(200);
  },
});

export const save = mutation({
  args: {
    agentId: v.id("agents"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    if (!ALLOWED.test(args.fileName)) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Only PDF, Markdown and text files are supported.");
    }
    if (args.size > MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("Files must be under 20 MB.");
    }
    const documentId = await ctx.db.insert("documents", {
      ...args,
      status: "indexing",
      mossDocIds: [],
      uploadedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.memory.indexDocument, { documentId });
    return documentId;
  },
});

export const retry = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get("documents", documentId);
    if (!doc) return;
    await ctx.db.patch("documents", documentId, { status: "indexing", error: undefined });
    await ctx.scheduler.runAfter(0, internal.memory.indexDocument, { documentId });
  },
});

export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get("documents", documentId);
    if (!doc) return;
    const agent = await ctx.db.get("agents", doc.agentId);
    if (agent && doc.mossDocIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.memory.deleteDocs, {
        indexName: agent.mossIndexName,
        docIds: doc.mossDocIds,
      });
    }
    await ctx.storage.delete(doc.storageId);
    await ctx.db.delete("documents", documentId);
  },
});

export const getForIndexing = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get("documents", documentId);
    if (!doc) return null;
    const agent = await ctx.db.get("agents", doc.agentId);
    if (!agent) return null;
    const url = await ctx.storage.getUrl(doc.storageId);
    return { doc, indexName: agent.mossIndexName, url };
  },
});

export const setIndexResult = internalMutation({
  args: {
    documentId: v.id("documents"),
    indexName: v.string(),
    ok: v.boolean(),
    mossDocIds: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { documentId, indexName, ok, mossDocIds, error }) => {
    const doc = await ctx.db.get("documents", documentId);
    if (!doc) {
      // Deleted while indexing: don't leave orphaned chunks in memory.
      if (mossDocIds?.length) {
        await ctx.scheduler.runAfter(0, internal.memory.deleteDocs, {
          indexName,
          docIds: mossDocIds,
        });
      }
      return;
    }
    await ctx.db.patch("documents", documentId, {
      status: ok ? "ready" : "failed",
      mossDocIds: mossDocIds ?? doc.mossDocIds,
      error: ok ? undefined : error,
    });
  },
});
