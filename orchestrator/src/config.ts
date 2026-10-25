export type Env = Record<string, string | undefined>;

function reader(env: Env) {
  return (name: string, fallback = "") => env[name]?.trim() || fallback;
}

/** Builds the settings from an environment map, so tests can inject fake values. */
export function buildConfig(env: Env) {
  const opt = reader(env);
  return {
    port: Number(opt("PORT", "8787")),
    /** Shared with the Convex deployment's ORCHESTRATOR_SECRET (internal calls from Convex). */
    secret: opt("ORCHESTRATOR_SECRET"),
    /** Stable public base URL of this server. Recall sends webhooks here. */
    publicUrl: (opt("PUBLIC_API_BASE_URL") || opt("ORCHESTRATOR_PUBLIC_URL", "http://localhost:8787")).replace(
      /\/$/,
      "",
    ),
    /** Public base URL of the Next.js app (Recall renders /bot/[meetingId] from here). */
    botPageBaseUrl: opt("BOT_PAGE_BASE_URL", "http://localhost:3000").replace(/\/$/, ""),
    convexUrl: opt("CONVEX_URL", "http://127.0.0.1:3210"),

    recall: {
      apiKey: opt("RECALL_API_KEY"),
      region: opt("RECALL_REGION", "us-west-2"),
      /** Verifies every webhook, realtime and callback request from Recall. Lives only on the server. */
      webhookSecret: opt("RECALL_WEBHOOK_VERIFICATION_SECRET"),
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
    contextDev: {
      apiKey: opt("CONTEXT_DEV_API_KEY"),
    },
    slack: {
      botToken: opt("SLACK_BOT_TOKEN"),
      appToken: opt("SLACK_APP_TOKEN"),
    },
  };
}

export type Config = ReturnType<typeof buildConfig>;

export const config = buildConfig(process.env);

export function missingConfig(c: Config = config) {
  const checks: [string, boolean][] = [
    ["ORCHESTRATOR_SECRET", !!c.secret],
    ["RECALL_API_KEY", !!c.recall.apiKey],
    ["RECALL_WEBHOOK_VERIFICATION_SECRET", !!c.recall.webhookSecret],
    [
      "PUBLIC_API_BASE_URL (a public https URL, not localhost)",
      /^https:\/\//.test(c.publicUrl) && !/localhost|127\.0\.0\.1/.test(c.publicUrl),
    ],
    ["ANTHROPIC_API_KEY", !!c.anthropicKey],
    ["CARTESIA_API_KEY / CARTESIA_VOICE_ID", !!c.cartesia.apiKey && !!c.cartesia.voiceId],
    ["MOSS_PROJECT_ID / MOSS_PROJECT_KEY", !!c.moss.projectId && !!c.moss.projectKey],
    ["CONTEXT_DEV_API_KEY", !!c.contextDev.apiKey],
    ["SLACK_BOT_TOKEN / SLACK_APP_TOKEN", !!c.slack.botToken && !!c.slack.appToken],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}
