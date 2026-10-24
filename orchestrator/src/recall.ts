import { config, type Config } from "./config.js";
import { logger } from "./log.js";

const log = logger("recall");

type FetchLike = typeof fetch;

export type RecallClientOptions = {
  apiKey: string;
  region: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
};

export class RecallError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type CalendarEvent = {
  id: string;
  calendar_id: string;
  start_time: string;
  end_time: string;
  meeting_url: string | null;
  is_deleted: boolean;
  updated_at: string;
  raw?: {
    summary?: string;
    description?: string;
    attendees?: { self?: boolean; responseStatus?: string }[];
  } & Record<string, unknown>;
  bots?: { bot_id: string; start_time?: string; meeting_url?: string }[];
};

export type RecallCalendar = {
  id: string;
  platform: string;
  platform_email?: string | null;
  status: string;
};

type Page<T> = { results: T[]; next: string | null };

const RETRY_STATUSES = new Set([409, 429, 503, 507]);

/** Seconds from a Retry-After header, which is either a number or an HTTP date. */
function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

export function createRecallClient(opts: RecallClientOptions) {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const maxAttempts = opts.maxAttempts ?? 5;
  const origin = `https://${opts.region}.recall.ai`;

  /**
   * Retries throttling and capacity responses, which mean Recall did not act on the request.
   * Network failures are only retried for reads: a lost connection on a create is ambiguous.
   */
  async function request<T>(method: string, pathOrUrl: string, body?: unknown): Promise<T> {
    if (!opts.apiKey) throw new Error("RECALL_API_KEY isn't set on the orchestrator.");
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${origin}${pathOrUrl}`;
    if (!url.startsWith(`${origin}/`)) throw new Error("Refusing to send the Recall API key to another host.");
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers: {
            Authorization: opts.apiKey,
            accept: "application/json",
            "content-type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        if (method === "GET" && attempt < maxAttempts) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new Error(`Couldn't reach Recall: ${(e as Error).message}`, {
          cause: e,
        });
      }
      const text = await res.text();
      if (res.ok) return (text ? JSON.parse(text) : null) as T;
      if (RETRY_STATUSES.has(res.status) && attempt < maxAttempts) {
        const wait = retryAfterMs(res.headers.get("retry-after")) ?? backoff(attempt);
        log.warn(`${method} ${new URL(url).pathname} → ${res.status}, retrying in ${Math.round(wait)}ms`);
        await sleep(wait);
        continue;
      }
      log.error(`${method} ${new URL(url).pathname} → ${res.status}`, text.slice(0, 500));
      throw new RecallError(res.status, `Recall returned ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  function backoff(attempt: number) {
    return Math.min(30_000, 500 * 2 ** (attempt - 1)) * (0.5 + random() / 2);
  }

  const v1 = (path: string) => `/api/v1${path}`;
  const v2 = (path: string) => `/api/v2${path}`;

  async function paged<T>(first: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = first;
    for (let pages = 0; next && pages < 50; pages++) {
      const page: Page<T> = await request("GET", next);
      out.push(...page.results);
      next = page.next; // follow Recall's cursor URL unchanged
    }
    return out;
  }

  return {
    request,

    createBot: (body: Record<string, unknown>) => request<{ id: string }>("POST", v1("/bot/"), body),

    /** Bots Recall already holds for a meeting, used to reconcile after a crash between create and save. */
    async findBotsByMeetingId(meetingId: string) {
      const page = await request<Page<{ id: string }>>(
        "GET",
        v1(`/bot/?metadata__meetingId=${encodeURIComponent(meetingId)}`),
      );
      return page.results;
    },

    async sendChat(botId: string, message: string) {
      // Google Meet chat messages are capped at 500 characters.
      await request("POST", v1(`/bot/${botId}/send_chat_message/`), {
        message: message.slice(0, 500),
      });
    },

    leaveCall: (botId: string) => request("POST", v1(`/bot/${botId}/leave_call/`)),

    /** Latest status code for a bot (e.g. "in_call_recording", "call_ended", "done", "fatal"). */
    getBotStatus: async (botId: string) => {
      const bot = await request<{
        status_changes?: { code: string; sub_code?: string | null }[];
      }>("GET", v1(`/bot/${botId}/`));
      const last = bot.status_changes?.at(-1);
      return last ? { code: last.code, subCode: last.sub_code ?? null } : null;
    },

    listCalendars: () => paged<RecallCalendar>(v2("/calendars/")),

    listCalendarEvents(calendarId: string, updatedAtGte?: string) {
      const q = new URLSearchParams({ calendar_id: calendarId });
      if (updatedAtGte) q.set("updated_at__gte", updatedAtGte);
      return paged<CalendarEvent>(v2(`/calendar-events/?${q}`));
    },

    scheduleCalendarEventBot: (eventId: string, deduplicationKey: string, botConfig: Record<string, unknown>) =>
      request<CalendarEvent>("POST", v2(`/calendar-events/${eventId}/bot/`), {
        deduplication_key: deduplicationKey,
        bot_config: botConfig,
      }),

    removeCalendarEventBot: (eventId: string) => request("DELETE", v2(`/calendar-events/${eventId}/bot/`)),
  };
}

export type RecallClient = ReturnType<typeof createRecallClient>;

export function joinMessage(name: string) {
  return `Hi, I'm ${name}. I'm transcribing this meeting and taking notes. Say 'Hey ${name}' to ask me something, or remove me from the call to stop.`;
}

/** Everything about the bot except its meeting URL and join time, shared by pasted links and calendar events. */
export function buildBotConfig(
  c: Pick<Config, "publicUrl" | "botPageBaseUrl"> & {
    recall: Pick<Config["recall"], "outputMode">;
  },
  opts: { meetingId: string; botName: string },
) {
  return {
    bot_name: opts.botName,
    metadata: { meetingId: opts.meetingId },
    output_media: {
      [c.recall.outputMode]: {
        kind: "webpage",
        config: { url: `${c.botPageBaseUrl}/bot/${opts.meetingId}` },
      },
    },
    chat: {
      on_bot_join: {
        send_to: "everyone",
        message: joinMessage(opts.botName),
        pin: true,
      },
    },
    recording_config: {
      transcript: {
        provider: {
          recallai_streaming: {
            mode: "prioritize_low_latency",
            language_code: "en",
          },
        },
        diarization: { use_separate_streams_when_available: true },
      },
      realtime_endpoints: [
        {
          type: "webhook",
          // Verified with the workspace signature; the trailing slash is required by Recall.
          url: `${c.publicUrl}/recall/realtime/`,
          events: ["transcript.data", "transcript.partial_data", "participant_events.chat_message"],
        },
      ],
    },
  };
}

// ---------------------------------------------------------------- default instance for the running server

export const client = createRecallClient({
  apiKey: config.recall.apiKey,
  region: config.recall.region,
});

export async function createBot(opts: { meetingId: string; meetUrl: string; botName: string }) {
  const body = { meeting_url: opts.meetUrl, ...buildBotConfig(config, opts) };
  const bot = await client.createBot(body);
  log.info(`bot ${bot.id} created for meeting ${opts.meetingId}`);
  return bot;
}

export async function sendChat(botId: string, message: string) {
  try {
    await client.sendChat(botId, message);
  } catch (e) {
    log.warn(`chat send failed: ${(e as Error).message}`);
  }
}

export const leaveCall = client.leaveCall;
export const getBotStatus = client.getBotStatus;
