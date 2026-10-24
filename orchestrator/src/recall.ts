import { config } from "./config.js";
import { logger } from "./log.js";

const log = logger("recall");

function base() {
  return `https://${config.recall.region}.recall.ai/api/v1`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!config.recall.apiKey) throw new Error("RECALL_API_KEY isn't set on the orchestrator.");
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: {
      Authorization: config.recall.apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    log.error(`${method} ${path} → ${res.status}`, text.slice(0, 500));
    throw new Error(`Recall returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export function joinMessage(name: string) {
  return `Hi, I'm ${name}. I'm transcribing this meeting and taking notes. Say 'Hey ${name}' to ask me something, or remove me from the call to stop.`;
}

export async function createBot(opts: { meetingId: string; meetUrl: string; botName: string }) {
  const webhook = `${config.publicUrl}/recall/realtime/?token=${encodeURIComponent(config.secret)}`;
  const page = `${config.botPageBaseUrl}/bot/${opts.meetingId}`;
  const body = {
    meeting_url: opts.meetUrl,
    bot_name: opts.botName,
    metadata: { meetingId: opts.meetingId },
    output_media: {
      [config.recall.outputMode]: { kind: "webpage", config: { url: page } },
    },
    chat: {
      on_bot_join: { send_to: "everyone", message: joinMessage(opts.botName), pin: true },
    },
    recording_config: {
      transcript: {
        provider: { recallai_streaming: { mode: "prioritize_low_latency", language_code: "en" } },
        diarization: { use_separate_streams_when_available: true },
      },
      realtime_endpoints: [
        {
          type: "webhook",
          url: webhook,
          events: ["transcript.data", "transcript.partial_data", "participant_events.chat_message"],
        },
      ],
    },
  };
  const bot = await request<{ id: string }>("POST", "/bot/", body);
  log.info(`bot ${bot.id} created for meeting ${opts.meetingId} (page ${page})`);
  return bot;
}

export async function sendChat(botId: string, message: string) {
  try {
    // Google Meet chat messages are capped at 500 characters.
    await request("POST", `/bot/${botId}/send_chat_message/`, { message: message.slice(0, 500) });
  } catch (e) {
    log.warn(`chat send failed: ${(e as Error).message}`);
  }
}

export async function leaveCall(botId: string) {
  await request("POST", `/bot/${botId}/leave_call/`);
}

/** Latest status code for a bot (e.g. "in_call_recording", "call_ended", "done", "fatal"). */
export async function getBotStatus(botId: string) {
  const bot = await request<{ status_changes?: { code: string; sub_code?: string | null }[] }>(
    "GET",
    `/bot/${botId}/`,
  );
  const last = bot.status_changes?.at(-1);
  return last ? { code: last.code, subCode: last.sub_code ?? null } : null;
}
