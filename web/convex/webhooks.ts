import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 500;

/** Recall retries webhooks for at most 24 hours, so a week of ids is plenty. */
export const prune = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const old = await ctx.db
      .query("webhookEvents")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", Date.now() - KEEP_MS))
      .take(BATCH);
    for (const row of old) await ctx.db.delete("webhookEvents", row._id);
    if (old.length === BATCH) await ctx.scheduler.runAfter(0, internal.webhooks.prune, {});
    return null;
  },
});
