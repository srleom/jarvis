import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "./app.js";
import { FAKE_SECRET } from "./test-helpers.js";
import { signRecallPayload } from "./verify.js";

const claimed = new Set<string>();
const realtime: string[] = [];
const dashboard: string[] = [];
let claimFails = false;
let server: Server;
let base: string;

before(async () => {
  const app = createApp({
    health: () => ({ ok: true }),
    webhooks: {
      secret: FAKE_SECRET,
      claim: async (id) => {
        if (claimFails) throw new Error("db down");
        return claimed.has(id) ? false : (claimed.add(id), true);
      },
      onRealtime: async (e) => void realtime.push(e.event),
      onDashboard: async (e) => void dashboard.push(e.event),
    },
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function post(path: string, body: unknown, headers?: Record<string, string>, id = `msg_${Math.random()}`) {
  const raw = JSON.stringify(body);
  return fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers ?? signRecallPayload(FAKE_SECRET, id, raw)) },
    body: raw,
  });
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test("rejects unsigned and wrongly signed requests without running handlers", async () => {
  assert.equal((await post("/recall/webhooks", { event: "bot.done" }, {})).status, 401);
  const forged = signRecallPayload("whsec_" + Buffer.from("other").toString("base64"), "m", JSON.stringify({ event: "bot.done" }));
  assert.equal((await post("/recall/webhooks", { event: "bot.done" }, forged)).status, 401);
  await settle();
  assert.deepEqual(dashboard, []);
});

test("accepts a signed dashboard webhook, acks 2xx and hands it to the handler", async () => {
  const res = await post("/recall/webhooks", { event: "calendar.sync_events", data: { calendar_id: "c1" } });
  assert.equal(res.status, 200);
  await settle();
  assert.deepEqual(dashboard, ["calendar.sync_events"]);
});

test("a retried message id is acknowledged but processed once", async () => {
  dashboard.length = 0;
  const body = { event: "bot.done", data: { bot: { id: "b" } } };
  assert.equal((await post("/recall/webhooks", body, undefined, "msg_same")).status, 200);
  const again = await post("/recall/webhooks", body, undefined, "msg_same");
  assert.equal(again.status, 200);
  assert.equal(((await again.json()) as { duplicate?: boolean }).duplicate, true);
  await settle();
  assert.deepEqual(dashboard, ["bot.done"]);
});

test("transcript finals are deduplicated, partials are not", async () => {
  realtime.length = 0;
  const final = { event: "transcript.data", data: {} };
  await post("/recall/realtime/", final, undefined, "msg_t1");
  await post("/recall/realtime/", final, undefined, "msg_t1");
  await post("/recall/realtime/", { event: "transcript.partial_data", data: {} });
  await post("/recall/realtime/", { event: "transcript.partial_data", data: {} });
  await settle();
  assert.deepEqual(realtime, ["transcript.data", "transcript.partial_data", "transcript.partial_data"]);
});

test("asks Recall to retry when the idempotency ledger is unavailable", async () => {
  claimFails = true;
  dashboard.length = 0;
  assert.equal((await post("/recall/webhooks", { event: "bot.done" })).status, 503);
  claimFails = false;
  await settle();
  assert.deepEqual(dashboard, []);
});

test("rejects a body that is signed but not JSON", async () => {
  const raw = "not json";
  const res = await fetch(base + "/recall/webhooks", { method: "POST", headers: signRecallPayload(FAKE_SECRET, "msg_bad", raw), body: raw });
  assert.equal(res.status, 400);
});
