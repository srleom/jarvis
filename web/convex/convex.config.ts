import { defineApp } from "convex/server";
import { v } from "convex/values";

// Set these with `npx convex env set NAME value`.
export default defineApp({
  env: {
    ANTHROPIC_API_KEY: v.optional(v.string()),
    SLACK_BOT_TOKEN: v.optional(v.string()),
    ORCHESTRATOR_URL: v.optional(v.string()),
    ORCHESTRATOR_SECRET: v.optional(v.string()),
  },
});
