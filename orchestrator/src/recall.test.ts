import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBotConfig, createRecallClient } from "./recall.js";
import { fakeResponse } from "./test-helpers.js";

function harness(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  const fetchFake: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("unexpected call");
    if (next instanceof Error) throw next;
    return next;
  };
  const client = createRecallClient({
    apiKey: "fake-key",
    region: "us-west-2",
    fetch: fetchFake,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
  });
  return { client, calls, sleeps };
}

test("sends the key to the configured region only", async () => {
  const { client, calls } = harness([fakeResponse(200, { id: "bot_1" })]);
  await client.createBot({ meeting_url: "https://meet.google.com/abc-defg-hij" });
  assert.equal(calls[0]!.url, "https://us-west-2.recall.ai/api/v1/bot/");
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, "fake-key");
  await assert.rejects(client.request("GET", "https://evil.example/api/v1/bot/"));
});

test("waits for Retry-After on 429 and then succeeds", async () => {
  const { client, calls, sleeps } = harness([fakeResponse(429, "slow down", { "retry-after": "3" }), fakeResponse(200, { id: "bot_1" })]);
  assert.deepEqual(await client.createBot({}), { id: "bot_1" });
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [3000]);
});

test("backs off with jitter on 507 and gives up after the attempt limit", async () => {
  const { client, calls } = harness(Array.from({ length: 5 }, () => fakeResponse(507, "no bots")));
  await assert.rejects(client.createBot({}), /507/);
  assert.equal(calls.length, 5);
});

test("never retries a create after an ambiguous network failure", async () => {
  const { client, calls } = harness([new Error("socket hang up")]);
  await assert.rejects(client.createBot({}));
  assert.equal(calls.length, 1);
});

test("retries reads after a network failure", async () => {
  const { client, calls } = harness([new Error("reset"), fakeResponse(200, { status_changes: [{ code: "done" }] })]);
  assert.deepEqual(await client.getBotStatus("bot_1"), { code: "done", subCode: null });
  assert.equal(calls.length, 2);
});

test("follows pagination cursors unchanged", async () => {
  const next = "https://us-west-2.recall.ai/api/v2/calendar-events/?cursor=abc&calendar_id=c1";
  const { client, calls } = harness([fakeResponse(200, { results: [{ id: "e1" }], next }), fakeResponse(200, { results: [{ id: "e2" }], next: null })]);
  const events = await client.listCalendarEvents("c1", "2026-01-01T00:00:00Z");
  assert.deepEqual(events.map((e) => e.id), ["e1", "e2"]);
  assert.match(calls[0]!.url, /calendar_id=c1&updated_at__gte=2026-01-01T00%3A00%3A00Z/);
  assert.equal(calls[1]!.url, next);
});

test("bot config carries the meeting id, Recall transcription and a slash-terminated signed webhook URL", () => {
  const cfg = buildBotConfig(
    { publicUrl: "https://api.example.test", botPageBaseUrl: "https://web.example.test", recall: { outputMode: "screenshare" } },
    { meetingId: "m1", botName: "Jarvis" },
  );
  assert.deepEqual(cfg.metadata, { meetingId: "m1" });
  assert.equal(cfg.output_media.screenshare!.config.url, "https://web.example.test/bot/m1");
  assert.ok("recallai_streaming" in cfg.recording_config.transcript.provider);
  const endpoint = cfg.recording_config.realtime_endpoints[0]!;
  assert.equal(endpoint.url, "https://api.example.test/recall/realtime/");
  assert.ok(!endpoint.url.includes("?"), "no secret in the URL");
});
