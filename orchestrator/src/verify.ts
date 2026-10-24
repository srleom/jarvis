import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_S = 5 * 60;

export class VerificationError extends Error {}

type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers, ...names: string[]) {
  for (const n of names) {
    const v = headers[n];
    const s = Array.isArray(v) ? v.join(" ") : v;
    if (s) return s;
  }
  return undefined;
}

/**
 * Verifies a request from Recall (dashboard webhook, realtime endpoint or callback) against the
 * workspace verification secret. `payload` must be the raw body exactly as received.
 * Returns the message id, which is stable across retries of the same message.
 */
export function verifyRecallRequest(args: {
  secret: string;
  headers: Headers;
  payload: string | null;
  now?: number;
}): string {
  const { secret, headers, payload } = args;
  if (!secret.startsWith("whsec_")) throw new VerificationError("Verification secret is missing or malformed.");
  const id = header(headers, "webhook-id", "svix-id");
  const timestamp = header(headers, "webhook-timestamp", "svix-timestamp");
  const signatures = header(headers, "webhook-signature", "svix-signature");
  if (!id || !timestamp || !signatures) throw new VerificationError("Missing signature headers.");

  const ts = Number(timestamp);
  const nowS = Math.floor((args.now ?? Date.now()) / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > TOLERANCE_S) {
    throw new VerificationError("Timestamp outside the allowed window.");
  }

  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload ?? ""}`)
    .digest();
  for (const versioned of signatures.split(" ")) {
    const [version, sig] = versioned.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return id;
  }
  throw new VerificationError("No matching signature.");
}

/** Signs a payload the way Recall does. Used by the simulator and tests. */
export function signRecallPayload(
  secret: string,
  id: string,
  payload: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${sig}`,
  };
}
