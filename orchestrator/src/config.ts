function opt(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  port: Number(opt("PORT", "8787")),
  /** Shared with the Convex deployment's ORCHESTRATOR_SECRET. */
  secret: opt("ORCHESTRATOR_SECRET"),
  /** Public base URL of this server (Recall sends webhooks here). */
  publicUrl: opt("ORCHESTRATOR_PUBLIC_URL", "http://localhost:8787").replace(/\/$/, ""),
  /** Public base URL of the Next.js app (Recall renders /bot/[meetingId] from here). */
  botPageBaseUrl: opt("BOT_PAGE_BASE_URL", "http://localhost:3000").replace(/\/$/, ""),
  convexUrl: opt("CONVEX_URL", "http://127.0.0.1:3210"),

  recall: {
    apiKey: opt("RECALL_API_KEY"),
    region: opt("RECALL_REGION", "us-west-2"),
    /** "screenshare" (default) or "camera" if screenshare doesn't work in Meet. */
    outputMode: opt("RECALL_OUTPUT_MODE", "screenshare") as "screenshare" | "camera",
  },
  anthropicKey: opt("ANTHROPIC_API_KEY"),
  cartesia: {
    apiKey: opt("CARTESIA_API_KEY"),
    voiceId: opt("CARTESIA_VOICE_ID"),
    model: opt("CARTESIA_MODEL", "sonic-3.6"),
    version: opt("CARTESIA_VERSION", "2026-08-14"),
  },
  moss: {
    projectId: opt("MOSS_PROJECT_ID"),
    projectKey: opt("MOSS_PROJECT_KEY"),
  },
  brightData: {
    apiKey: opt("BRIGHT_DATA_API_KEY"),
    serpZone: opt("BRIGHT_DATA_SERP_ZONE"),
    unlockerZone: opt("BRIGHT_DATA_UNLOCKER_ZONE"),
  },
  slack: {
    botToken: opt("SLACK_BOT_TOKEN"),
    appToken: opt("SLACK_APP_TOKEN"),
  },
};

export function missingConfig() {
  const checks: [string, boolean][] = [
    ["ORCHESTRATOR_SECRET", !!config.secret],
    ["RECALL_API_KEY", !!config.recall.apiKey],
    ["ANTHROPIC_API_KEY", !!config.anthropicKey],
    ["CARTESIA_API_KEY / CARTESIA_VOICE_ID", !!config.cartesia.apiKey && !!config.cartesia.voiceId],
    ["MOSS_PROJECT_ID / MOSS_PROJECT_KEY", !!config.moss.projectId && !!config.moss.projectKey],
    ["BRIGHT_DATA_API_KEY / zones", !!config.brightData.apiKey && !!config.brightData.serpZone],
    ["SLACK_BOT_TOKEN / SLACK_APP_TOKEN", !!config.slack.botToken && !!config.slack.appToken],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}
