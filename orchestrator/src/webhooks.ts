import express, { type Router } from "express";
import { logger } from "./log.js";
import { VerificationError, verifyRecallRequest } from "./verify.js";

const log = logger("webhooks");

export type RecallEvent = { event: string; data: unknown };

export type WebhookDeps = {
  /** RECALL_WEBHOOK_VERIFICATION_SECRET. Requests are rejected while it is unset. */
  secret: string;
  /** True the first time a message id is seen; false for retries. May throw, which makes Recall retry. */
  claim(messageId: string): Promise<boolean>;
  /** In-call data: transcript and chat. */
  onRealtime(evt: RecallEvent): Promise<void>;
  /** Dashboard webhooks: bot lifecycle and Calendar V2. */
  onDashboard(evt: RecallEvent): Promise<void>;
  now?: () => number;
};

/** Transcript finals and chat have side effects. Partials just overwrite, so they skip the id ledger. */
const DEDUPED_REALTIME = new Set(["transcript.data", "participant_events.chat_message"]);

/**
 * Receives requests from Recall. Each one is verified against the raw body, claimed for idempotency,
 * acknowledged with 2xx straight away, and then processed in the background.
 */
export function createWebhookRouter(deps: WebhookDeps): Router {
  const router = express.Router();

  function receiver(kind: "realtime" | "dashboard") {
    return async (req: express.Request, res: express.Response) => {
      if (!deps.secret) {
        res.status(503).json({ error: "Webhook verification isn't configured." });
        return;
      }
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      let messageId: string;
      try {
        messageId = verifyRecallRequest({
          secret: deps.secret,
          headers: req.headers,
          payload: raw,
          now: deps.now?.(),
        });
      } catch (e) {
        log.warn(`${kind} request rejected: ${e instanceof VerificationError ? e.message : "verification failed"}`);
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      let evt: RecallEvent;
      try {
        evt = JSON.parse(raw) as RecallEvent;
        if (typeof evt?.event !== "string") throw new Error("no event");
      } catch {
        res.status(400).json({ error: "Invalid payload" });
        return;
      }

      if (kind === "dashboard" || DEDUPED_REALTIME.has(evt.event)) {
        try {
          if (!(await deps.claim(messageId))) {
            res.status(200).json({ ok: true, duplicate: true });
            return;
          }
        } catch (e) {
          log.error(`couldn't record ${evt.event}: ${(e as Error).message}`);
          res.status(503).json({ error: "Try again" });
          return;
        }
      }

      res.status(200).json({ ok: true });
      const dispatched = kind === "realtime" ? deps.onRealtime(evt) : deps.onDashboard(evt);
      void dispatched.catch((e) => log.error(`${evt.event} failed: ${(e as Error).message}`));
    };
  }

  const raw = express.raw({ type: () => true, limit: "2mb" });
  router.post("/recall/realtime", raw, receiver("realtime"));
  router.post("/recall/webhooks", raw, receiver("dashboard"));
  return router;
}
