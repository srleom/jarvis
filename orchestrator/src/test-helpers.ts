import { randomBytes } from "node:crypto";

/** A syntactically valid fake verification secret. Never a real credential. */
export const FAKE_SECRET = `whsec_${randomBytes(24).toString("base64")}`;

export function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}
