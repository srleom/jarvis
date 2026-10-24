/**
 * Drives a meeting with fake Recall webhook events so you can test the whiteboard, wake word,
 * Q&A and relay without a real call.
 *
 *   npx convex run seed:liveMeeting '{"agentId":"<agent id>"}'   (in web/)
 *   pnpm simulate <meetingId>                                     (in orchestrator/)
 *
 * Then open http://localhost:3000/bot/<meetingId> to watch.
 */
import { signRecallPayload } from "../src/verify.js";

const meetingId = process.argv[2];
if (!meetingId) {
  console.error("Usage: pnpm simulate <meetingId>");
  process.exit(1);
}
const base = (process.env.SIMULATE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`).replace(/\/$/, "");
const url = `${base}/recall/realtime/`;
const webhookSecret = process.env.RECALL_WEBHOOK_VERIFICATION_SECRET ?? "";
if (!webhookSecret) {
  console.error(
    "Set RECALL_WEBHOOK_VERIFICATION_SECRET (the same value the orchestrator uses) so events can be signed.",
  );
  process.exit(1);
}
const bot = { id: `sim-${meetingId}`, metadata: { meetingId } };

const script: [string, number, string][] = [
  ["Ava Chen", 1, "Okay let's get started. Main thing today is the venue for the spring hackathon."],
  ["Sam Rivera", 2, "Our budget for the venue is ten thousand dollars, max."],
  ["Ava Chen", 1, "Let's go with the Palace of Fine Arts if it's under 10k."],
  ["Priya Nair", 3, "Hey Jarvis, how much does it cost to rent the Palace of Fine Arts, and does it fit our budget?"],
  ["Sam Rivera", 2, "Great, so that's decided then, Palace of Fine Arts."],
  ["Ava Chen", 1, "Sam, can you email them to hold the date by Friday?"],
  ["Sam Rivera", 2, "Yep, I'll do it tomorrow."],
  ["Priya Nair", 3, "I'll draft the sponsor deck. Do we need overnight security?"],
];

let seq = 0;
async function post(event: string, participant: { id: number; name: string }, text: string, t: number) {
  const words = text.split(" ").map((w, i) => ({ text: w, start_timestamp: { relative: t + i * 0.3 } }));
  const body = JSON.stringify({
    event,
    data: { data: { words, participant }, bot },
  });
  await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...signRecallPayload(webhookSecret, `msg_sim_${meetingId}_${Date.now()}_${seq++}`, body),
    },
    body,
  });
}

let t = 5;
for (const [name, id, text] of script) {
  const participant = { id, name };
  const words = text.split(" ");
  for (let i = 3; i < words.length; i += 4) {
    await post("transcript.partial_data", participant, words.slice(0, i).join(" "), t);
    await new Promise((r) => setTimeout(r, 300));
  }
  await post("transcript.data", participant, text, t);
  console.log(`${name}: ${text}`);
  t += words.length * 0.4 + 2;
  await new Promise((r) => setTimeout(r, text.toLowerCase().includes("hey jarvis") ? 12000 : 4000));
}
console.log("Done. The whiteboard updates every 15 seconds.");
