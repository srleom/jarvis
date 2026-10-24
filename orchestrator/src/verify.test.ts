import assert from "node:assert/strict";
import { test } from "node:test";
import { FAKE_SECRET } from "./test-helpers.js";
import { signRecallPayload, verifyRecallRequest } from "./verify.js";

const payload = JSON.stringify({ event: "bot.done" });
const now = 1_800_000_000_000;
const signed = () => signRecallPayload(FAKE_SECRET, "msg_1", payload, now / 1000);

test("accepts a correctly signed raw body and returns the message id", () => {
  assert.equal(
    verifyRecallRequest({
      secret: FAKE_SECRET,
      headers: signed(),
      payload,
      now,
    }),
    "msg_1",
  );
});

test("accepts svix-* headers and a rotated secret's extra signature", () => {
  const h = signed();
  const headers = {
    "svix-id": h["webhook-id"],
    "svix-timestamp": h["webhook-timestamp"],
    "svix-signature": `v1,AAAA ${h["webhook-signature"]}`,
  };
  assert.equal(verifyRecallRequest({ secret: FAKE_SECRET, headers, payload, now }), "msg_1");
});

test("rejects a tampered body", () => {
  assert.throws(() =>
    verifyRecallRequest({
      secret: FAKE_SECRET,
      headers: signed(),
      payload: payload + " ",
      now,
    }),
  );
});

test("rejects the wrong secret", () => {
  const other = signRecallPayload("whsec_" + Buffer.from("different").toString("base64"), "msg_1", payload, now / 1000);
  assert.throws(() => verifyRecallRequest({ secret: FAKE_SECRET, headers: other, payload, now }));
});

test("rejects missing headers, stale timestamps and a missing secret", () => {
  assert.throws(() => verifyRecallRequest({ secret: FAKE_SECRET, headers: {}, payload, now }));
  assert.throws(() =>
    verifyRecallRequest({
      secret: FAKE_SECRET,
      headers: signed(),
      payload,
      now: now + 10 * 60_000,
    }),
  );
  assert.throws(() => verifyRecallRequest({ secret: "", headers: signed(), payload, now }));
});
