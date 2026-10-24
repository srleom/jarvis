import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { logger } from "./log.js";
import { wavDurationMs } from "./tts.js";

const log = logger("audio");

/** WebSocket clients (bot pages) per meeting, and playback completion callbacks. */
const clients = new Map<string, Set<WebSocket>>();
const waiters = new Map<string, () => void>();

export function attachClient(meetingId: string, ws: WebSocket) {
  let set = clients.get(meetingId);
  if (!set) clients.set(meetingId, (set = new Set()));
  set.add(ws);
  log.info(`bot page connected for ${meetingId} (${set.size} client(s))`);

  const ping = setInterval(() => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ type: "ping" })), 20000);

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    try {
      const msg = JSON.parse(data.toString()) as { type: string; id?: string };
      if (msg.type === "ended" && msg.id) {
        waiters.get(msg.id)?.();
        waiters.delete(msg.id);
      }
    } catch {
      // ignore malformed messages
    }
  });
  ws.on("close", () => {
    clearInterval(ping);
    set!.delete(ws);
    log.info(`bot page disconnected for ${meetingId}`);
  });
}

export function hasClient(meetingId: string) {
  return (clients.get(meetingId)?.size ?? 0) > 0;
}

/** Waits up to `ms` for the bot page to connect. */
export async function waitForClient(meetingId: string, ms: number) {
  const until = Date.now() + ms;
  while (!hasClient(meetingId) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 250));
  }
  return hasClient(meetingId);
}

/**
 * Sends a WAV clip to the meeting's bot page and resolves when it finishes playing
 * (or after its duration plus a margin, if the page never reports back).
 */
export function play(meetingId: string, wav: Buffer): Promise<boolean> {
  const set = clients.get(meetingId);
  const open = [...(set ?? [])].filter((ws) => ws.readyState === ws.OPEN);
  if (open.length === 0) {
    log.warn(`no bot page connected for ${meetingId}; can't play audio`);
    return Promise.resolve(false);
  }
  const id = randomUUID();
  // Only one page should play; extra tabs (e.g. someone previewing) stay silent.
  const target = open[open.length - 1]!;
  target.send(JSON.stringify({ type: "play", id }));
  target.send(wav, { binary: true });
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      waiters.delete(id);
      resolve(true);
    }, wavDurationMs(wav) + 4000);
    waiters.set(id, () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

export function stop(meetingId: string) {
  for (const ws of clients.get(meetingId) ?? []) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "stop" }));
  }
}
