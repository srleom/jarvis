/**
 * Boots the production HTTP app with fake injected settings and makes real signed and unsigned requests
 * to it over loopback. Needs no credentials, Convex or network access to Recall.
 *
 *   pnpm smoke
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { buildConfig, missingConfig } from "../src/config.js";
import { createRecallClient } from "../src/recall.js";
import { signRecallPayload } from "../src/verify.js";

const secret = `whsec_${Buffer.from("smoke-test-secret-not-real").toString("base64")}`;
const config = buildConfig({
  RECALL_API_KEY: "fake-key",
  RECALL_WEBHOOK_VERIFICATION_SECRET: secret,
  PUBLIC_API_BASE_URL: "https://smoke.example.test",
  ORCHESTRATOR_SECRET: "fake",
});
assert.ok(missingConfig(config).every((m) => !m.startsWith("RECALL") && !m.startsWith("PUBLIC")));
// The Recall client is built from the same injected settings the server would use.
createRecallClient({
  apiKey: config.recall.apiKey,
  region: config.recall.region,
});

const seen: string[] = [];
const app = createApp({
  health: () => ({ ok: true }),
  webhooks: {
    secret: config.recall.webhookSecret,
    claim: () => Promise.resolve(true),
    onRealtime: () => Promise.resolve(),
    onDashboard: (e) => {
      seen.push(e.event);
      return Promise.resolve();
    },
  },
});

const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
try {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const body = JSON.stringify({ event: "bot.done", data: {} });
  const bad = await fetch(`${base}/recall/webhooks`, { method: "POST", body });
  assert.equal(bad.status, 401);
  const ok = await fetch(`${base}/recall/webhooks`, {
    method: "POST",
    body,
    headers: signRecallPayload(secret, "msg_smoke", body),
  });
  assert.equal(ok.status, 200);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen, ["bot.done"]);
  console.log("smoke ok: health 200, unsigned webhook 401, signed webhook 200 and handled");
} finally {
  server.close();
}
