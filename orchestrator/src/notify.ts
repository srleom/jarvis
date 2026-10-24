import { logger } from "./log.js";

const log = logger("notify");

type Sender = (slackUserId: string, text: string) => Promise<void>;
let sender: Sender | null = null;

/** The Slack bot registers itself here so meeting sessions can DM people without importing it. */
export function setDmSender(fn: Sender) {
  sender = fn;
}

export async function sendDM(slackUserId: string, text: string) {
  if (!sender) {
    log.warn(`Slack isn't connected; dropped DM to ${slackUserId}: ${text.slice(0, 80)}`);
    return;
  }
  try {
    await sender(slackUserId, text);
  } catch (e) {
    log.error(`DM to ${slackUserId} failed: ${(e as Error).message}`);
  }
}
