import express from "express";
import { createWebhookRouter, type WebhookDeps } from "./webhooks.js";

export type AppDeps = {
  webhooks: WebhookDeps;
  health: () => unknown;
};

/** The HTTP surface Recall talks to. index.ts adds the internal routes Convex calls. */
export function createApp(deps: AppDeps) {
  const app = express();
  // Webhook routes read the raw body themselves, so they must come before the JSON parser.
  app.use(createWebhookRouter(deps.webhooks));
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (_req, res) => {
    res.json(deps.health());
  });
  return app;
}
