import * as audio from "./audio.js";
import { complete, STRONG_MODEL } from "./claude.js";
import { api, convex, secret, type Doc, type Id } from "./convex.js";
import { logger } from "./log.js";
import * as memory from "./memory.js";
import { sendDM } from "./notify.js";
import { answerQuestion } from "./qa.js";
import * as recall from "./recall.js";
import { synthesize } from "./tts.js";
import { proposeBoardOps } from "./whiteboard.js";

const BOARD_INTERVAL_MS = 15_000;
const MOSS_INTERVAL_MS = 30_000;
const QUESTION_WAIT_MS = 5_000;
const RELAY_ANSWER_MAX_MS = 60_000;
const RELAY_SILENCE_MS = 8_000;
const RECENT_WINDOW_S = 5 * 60;

type Segment = { speaker: string; text: string; t: number; at: number };
type AvatarState = "listening" | "thinking" | "hand_raised" | "speaking";
type RelayItem = {
  relayId: Id<"relayRequests">;
  fromSlackUserId: string;
  fromName: string;
  message: string;
  preview: string;
};

export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstName(name: string) {
  return name.split(/\s+/)[0] ?? name;
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Live state for one meeting: wake word, Q&A, whiteboard loop, memory indexing and relay. */
export class MeetingSession {
  readonly meetingId: Id<"meetings">;
  agent: Doc<"agents">;
  botId: string | undefined;
  ended = false;

  private log;
  private speaking = false;
  private answering = false;
  private introduced = false;
  private lastRelative = 0;

  private finals: Segment[] = [];
  private boardCursor = 0;
  private boardRunning = false;
  private mossCursor = 0;
  private mossChunk = 0;

  private wakeFrom: number | null = null;
  private awaitingQuestion: { participantId: number; timer: NodeJS.Timeout } | null = null;

  private relayQueue: RelayItem[] = [];
  private relay: RelayItem | null = null;
  private relayPhase: "idle" | "hand_raised" | "speaking" | "awaiting_answer" = "idle";
  private relayAnswer: Segment[] = [];
  private relayAnswerStarted = 0;

  private timers: NodeJS.Timeout[] = [];

  constructor(meeting: Doc<"meetings">, agent: Doc<"agents">) {
    this.meetingId = meeting._id;
    this.agent = agent;
    this.botId = meeting.recallBotId;
    this.log = logger(`meeting ${meeting._id.slice(-6)}`);
  }

  get name() {
    return this.agent.name;
  }

  isLive() {
    return !this.ended;
  }

  // ---------------------------------------------------------------- lifecycle

  private startTimers() {
    this.timers.push(
      setInterval(() => void this.updateBoard(), BOARD_INTERVAL_MS),
      setInterval(() => void this.indexTranscript(false), MOSS_INTERVAL_MS),
      setInterval(() => this.maybeRaiseHand(), 1000),
    );
  }

  /** After an orchestrator restart: pick a live meeting back up without re-introducing. */
  resumeLive() {
    if (this.introduced) return;
    this.introduced = true;
    this.startTimers();
    this.log.info("resumed");
  }

  async goLive() {
    if (this.ended || this.introduced) return;
    this.introduced = true;
    await convex.mutation(api.orchestrator.setStatus, { secret, meetingId: this.meetingId, status: "live" });
    this.startTimers();
    this.log.info("live");
    // Give the bot page a moment to connect before the spoken intro.
    await audio.waitForClient(this.meetingId, 15_000);
    await this.speak(recall.joinMessage(this.name), { cacheable: true });
  }

  async end(failed = false, error?: string) {
    if (this.ended) return;
    this.ended = true;
    this.timers.forEach(clearInterval);
    if (this.awaitingQuestion) clearTimeout(this.awaitingQuestion.timer);
    audio.stop(this.meetingId);
    for (const r of [this.relay, ...this.relayQueue]) {
      if (r) await sendDM(r.fromSlackUserId, this.prefix("The meeting ended before I could pass on your message."));
    }
    try {
      await this.indexTranscript(true);
    } catch (e) {
      this.log.warn(`final memory flush failed: ${(e as Error).message}`);
    }
    await convex.mutation(api.orchestrator.setStatus, {
      secret,
      meetingId: this.meetingId,
      status: failed && !this.introduced ? "failed" : "ended",
      error,
    });
    this.log.info("ended");
  }

  private prefix(text: string) {
    return this.name.toLowerCase() === "jarvis" ? text : `${this.name}: ${text}`;
  }

  private async refreshAgent() {
    const ctx = await convex.query(api.orchestrator.meetingContext, { secret, meetingId: this.meetingId });
    if (ctx) this.agent = ctx.agent;
  }

  // ---------------------------------------------------------------- avatar & voice

  private async setAvatar(state: AvatarState, preview?: string) {
    try {
      await convex.mutation(api.orchestrator.setAvatar, { secret, meetingId: this.meetingId, state, preview });
    } catch (e) {
      this.log.warn(`avatar update failed: ${(e as Error).message}`);
    }
  }

  private restoreAvatar() {
    if (this.speaking) return this.setAvatar("speaking");
    if (this.relayPhase === "hand_raised" && this.relay) return this.setAvatar("hand_raised", this.relay.preview);
    if (this.answering) return this.setAvatar("thinking");
    return this.setAvatar("listening");
  }

  /** Speaks through the bot page. Falls back to Meet chat if audio can't play. */
  private async speak(text: string, { cacheable = false, record = true } = {}) {
    this.speaking = true;
    void this.setAvatar("speaking");
    try {
      const wav = await synthesize(text, { cacheable });
      const played = await audio.play(this.meetingId, wav);
      if (!played && this.botId) await recall.sendChat(this.botId, text);
    } catch (e) {
      this.log.warn(`speech failed, sending to chat: ${(e as Error).message}`);
      if (this.botId) await recall.sendChat(this.botId, text);
    } finally {
      this.speaking = false;
      await this.restoreAvatar();
    }
    if (record) {
      await convex
        .mutation(api.orchestrator.addTranscript, {
          secret,
          meetingId: this.meetingId,
          speaker: this.name,
          text,
          startTime: this.lastRelative,
        })
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------- transcript events

  private matchWake(text: string): string | null {
    const raw = escapeRe(this.name);
    // "hey <name> ..." anywhere, or "<name>, ..." at the start. Returns the question in its original casing.
    const m =
      text.match(new RegExp(`\\b(?:hey|hi|okay|ok)[\\s,]+${raw}\\b[\\s,.!?:-]*(.*)$`, "i")) ??
      text.match(new RegExp(`^\\s*${raw}\\s*[,!?:]\\s*(.*)$`, "i"));
    if (m) return m[1]!.trim();
    // Fall back to the normalized text in case the transcript inserted odd punctuation.
    const norm = normalize(text);
    const n = norm.match(new RegExp(`\\b(?:hey|hi|okay|ok) ${escapeRe(normalize(this.name))}\\b(.*)$`));
    return n ? n[1]!.trim() : null;
  }

  private matchCommand(text: string, phrase: string) {
    const name = normalize(this.name);
    const norm = normalize(text);
    return (
      norm.includes(`${phrase} ${name}`) ||
      norm.includes(`${name} ${phrase}`) ||
      norm.includes(`${phrase} hey ${name}`)
    );
  }

  onPartial(participantId: number, speaker: string, text: string) {
    if (this.ended || speaker === this.name) return;
    if (this.speaking || this.answering || this.wakeFrom !== null) return;
    if (this.relayPhase === "speaking" || this.relayPhase === "awaiting_answer") return;
    if (this.matchWake(text) !== null) {
      this.wakeFrom = participantId;
      this.log.info(`wake word from ${speaker}`);
      void this.setAvatar("thinking");
    }
  }

  async onFinal(participantId: number, speaker: string, text: string, startTime: number) {
    if (this.ended) return;
    this.lastRelative = Math.max(this.lastRelative, startTime);
    if (speaker === this.name) return; // our own voice, already recorded when we spoke
    const seg: Segment = { speaker, text, t: startTime, at: Date.now() };
    this.finals.push(seg);
    void convex
      .mutation(api.orchestrator.addTranscript, { secret, meetingId: this.meetingId, speaker, text, startTime })
      .catch((e) => this.log.warn(`transcript write failed: ${(e as Error).message}`));

    if (this.relayPhase === "awaiting_answer") {
      this.relayAnswer.push(seg);
      return;
    }

    if (this.relayPhase === "hand_raised") {
      if (this.matchCommand(text, "go ahead")) return void this.grantRelay();
      if (this.matchCommand(text, "not now")) return void this.deferRelay();
    }

    if (this.awaitingQuestion && this.awaitingQuestion.participantId === participantId) {
      clearTimeout(this.awaitingQuestion.timer);
      this.awaitingQuestion = null;
      this.wakeFrom = null;
      return void this.ask(speaker, text);
    }

    const question = this.speaking || this.answering ? null : this.matchWake(text);
    if (question !== null) {
      if (this.matchCommand(text, "go ahead") || this.matchCommand(text, "not now")) {
        this.wakeFrom = null;
        return void this.restoreAvatar();
      }
      if (question.split(" ").filter(Boolean).length < 2) {
        // Just "Hey Jarvis": wait for the question in their next utterance.
        void this.setAvatar("thinking");
        this.awaitingQuestion = {
          participantId,
          timer: setTimeout(() => {
            this.awaitingQuestion = null;
            this.wakeFrom = null;
            void this.restoreAvatar();
          }, QUESTION_WAIT_MS),
        };
        return;
      }
      this.wakeFrom = null;
      return void this.ask(speaker, question);
    }

    if (this.wakeFrom === participantId) {
      // The partial looked like a wake word but the final didn't. False alarm.
      this.wakeFrom = null;
      void this.restoreAvatar();
    }
  }

  async onChat(sender: string, text: string) {
    if (this.ended) return;
    const t = text.trim().toLowerCase();
    if (this.relayPhase === "hand_raised") {
      if (t === "go") return void this.grantRelay();
      if (t === "not now") return void this.deferRelay();
    }
    this.log.info(`chat from ${sender}: ${text.slice(0, 80)}`);
  }

  private recentTranscript() {
    const since = this.lastRelative - RECENT_WINDOW_S;
    return this.finals
      .filter((s) => s.t >= since)
      .map((s) => `[${clock(s.t)}] ${s.speaker}: ${s.text}`)
      .join("\n");
  }

  // ---------------------------------------------------------------- Q&A

  private async ask(askedBy: string, question: string) {
    if (this.answering) return;
    this.answering = true;
    this.log.info(`question from ${askedBy}: ${question}`);
    void this.setAvatar("thinking");
    try {
      const filler = this.speak("Let me check.", { cacheable: true, record: false });
      await this.refreshAgent().catch(() => {});
      const answer = await answerQuestion({
        agentName: this.name,
        behaviour: this.agent.behaviourInstructions,
        indexName: this.agent.mossIndexName,
        question,
        askedBy,
        recentTranscript: this.recentTranscript(),
      });
      await filler;
      await this.speak(answer.spoken_answer);
      await convex.mutation(api.orchestrator.addAnswer, {
        secret,
        meetingId: this.meetingId,
        askedBy,
        question,
        spokenAnswer: answer.spoken_answer,
        boardNote: answer.board_note,
        sourceUrl: answer.source_url ?? undefined,
        toolLog: answer.toolLog,
      });
    } catch (e) {
      this.log.error(`answering failed: ${(e as Error).message}`);
    } finally {
      this.answering = false;
      await this.restoreAvatar();
    }
  }

  // ---------------------------------------------------------------- whiteboard

  private async updateBoard() {
    if (this.boardRunning || this.ended || this.finals.length === this.boardCursor) return;
    this.boardRunning = true;
    const end = this.finals.length;
    try {
      const lines = this.finals
        .slice(this.boardCursor, end)
        .map((s) => `${s.speaker}: ${s.text}`)
        .join("\n");
      const board = await convex.query(api.orchestrator.board, { secret, meetingId: this.meetingId });
      const ops = await proposeBoardOps(
        board.map((n) => ({ id: n._id, column: n.column, text: n.text, owner: n.owner })),
        lines,
        this.name,
      );
      if (ops.length) {
        await convex.mutation(api.orchestrator.applyBoardOps, { secret, meetingId: this.meetingId, ops });
        this.log.info(`board: ${ops.map((o) => o.op).join(", ")}`);
      }
      this.boardCursor = end;
    } catch (e) {
      this.log.warn(`board update failed: ${(e as Error).message}`);
    } finally {
      this.boardRunning = false;
    }
  }

  // ---------------------------------------------------------------- memory

  private async indexTranscript(flush: boolean) {
    const pending = this.finals.slice(this.mossCursor);
    const words = pending.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    if (words === 0 || (!flush && words < 60)) return;
    const end = this.finals.length;
    const docs: memory.MemoryDoc[] = [];
    let chunk: Segment[] = [];
    let count = 0;
    const emit = () => {
      if (!chunk.length) return;
      const speakers = [...new Set(chunk.map((s) => s.speaker))].join(", ");
      docs.push({
        id: `transcript:${this.meetingId}:${this.mossChunk++}`,
        text: chunk.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
        metadata: {
          source: "transcript",
          meetingId: this.meetingId,
          speakers,
          time: clock(chunk[0]!.t),
        },
      });
      chunk = [];
      count = 0;
    };
    for (const s of pending) {
      chunk.push(s);
      count += s.text.split(/\s+/).length;
      if (count >= 200) emit();
    }
    emit();
    try {
      await memory.addDocs(this.agent.mossIndexName, docs);
      await convex.mutation(api.orchestrator.appendMossDocIds, {
        secret,
        meetingId: this.meetingId,
        ids: docs.map((d) => d.id),
      });
      this.mossCursor = end;
    } catch (e) {
      this.mossChunk -= docs.length;
      this.log.warn(`memory indexing failed: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- relay

  enqueueRelay(item: RelayItem) {
    this.relayQueue.push(item);
    this.maybeRaiseHand();
  }

  private maybeRaiseHand() {
    if (this.ended || this.relayPhase !== "idle" || this.speaking || this.answering) return;
    const next = this.relayQueue.shift();
    if (!next) return;
    this.relay = next;
    this.relayPhase = "hand_raised";
    this.log.info(`hand raised: ${next.preview}`);
    void convex.mutation(api.orchestrator.updateRelay, { secret, relayId: next.relayId, status: "hand_raised" });
    void this.setAvatar("hand_raised", next.preview);
    if (this.botId) {
      void recall.sendChat(
        this.botId,
        `✋ ${next.preview} Say "Go ahead, ${this.name}" or type "go" when you're ready.`,
      );
    }
  }

  private async deferRelay() {
    if (this.relayPhase !== "hand_raised") return;
    this.log.info("relay deferred");
    if (this.botId) await recall.sendChat(this.botId, "No problem. I'll keep my hand up until you're ready.");
  }

  private async grantRelay() {
    const r = this.relay;
    if (this.relayPhase !== "hand_raised" || !r) return;
    this.relayPhase = "speaking";
    this.log.info("relay granted");
    await convex.mutation(api.orchestrator.updateRelay, { secret, relayId: r.relayId, status: "speaking" });
    await this.speak(`${firstName(r.fromName)} says: ${r.message}`);

    this.relayPhase = "awaiting_answer";
    this.relayAnswer = [];
    this.relayAnswerStarted = Date.now();
    await convex.mutation(api.orchestrator.updateRelay, { secret, relayId: r.relayId, status: "awaiting_answer" });
    await this.setAvatar("listening");

    const check = setInterval(() => {
      const now = Date.now();
      const last = this.relayAnswer.at(-1)?.at;
      const silent = last !== undefined && now - last >= RELAY_SILENCE_MS;
      if (silent || now - this.relayAnswerStarted >= RELAY_ANSWER_MAX_MS || this.ended) {
        clearInterval(check);
        void this.finishRelay();
      }
    }, 500);
  }

  private async finishRelay() {
    const r = this.relay;
    if (!r || this.relayPhase !== "awaiting_answer") return;
    const said = this.relayAnswer.map((s) => `${s.speaker}: ${s.text}`).join("\n");
    this.relayPhase = "idle";
    this.relay = null;

    if (!said.trim()) {
      const reply = this.prefix("I read your message to the team, but nobody responded yet. I'll let you know if they do, or you can catch them when you join.");
      await sendDM(r.fromSlackUserId, reply);
      await convex.mutation(api.orchestrator.updateRelay, { secret, relayId: r.relayId, status: "expired", slackReply: reply });
    } else {
      const text =
        (await complete({
          model: STRONG_MODEL,
          system: `You are ${this.name}, an AI teammate in a meeting. You relayed a Slack message from ${r.fromName} to the team and now pass back their spoken answer. ${this.agent.behaviourInstructions}`,
          prompt: `${r.fromName}'s message to the team: "${r.message}"

What the team said after you read it out:
${said}

Write a short Slack reply to ${firstName(r.fromName)} (one to three sentences) in your own words, quoting the key point in "double quotes". If the team didn't really answer, say so honestly. Plain text only.`,
          maxTokens: 600,
          effort: "low",
        })) ?? `Here's what the team said: "${this.relayAnswer.map((s) => s.text).join(" ").slice(0, 400)}"`;
      const reply = this.prefix(text);
      await sendDM(r.fromSlackUserId, reply);
      await convex.mutation(api.orchestrator.updateRelay, {
        secret,
        relayId: r.relayId,
        status: "answered",
        teamAnswer: this.relayAnswer.map((s) => `${s.speaker}: ${s.text}`).join(" "),
        slackReply: reply,
      });
    }
    this.log.info("relay finished");
    await this.restoreAvatar();
    this.maybeRaiseHand();
  }
}

// -------------------------------------------------------------------- registry

const sessions = new Map<string, MeetingSession>();
const loading = new Map<string, Promise<MeetingSession | null>>();

export function getSession(meetingId: string) {
  return sessions.get(meetingId) ?? null;
}

/** Returns the live session for a meeting, loading it from Convex after a restart. */
export async function loadSession(meetingId: string): Promise<MeetingSession | null> {
  const existing = sessions.get(meetingId);
  if (existing) return existing;
  const inflight = loading.get(meetingId);
  if (inflight) return inflight;
  const p = (async () => {
    const ctx = await convex.query(api.orchestrator.meetingContext, {
      secret,
      meetingId: meetingId as Id<"meetings">,
    });
    if (!ctx || ctx.meeting.status === "ended" || ctx.meeting.status === "failed") return null;
    const s = new MeetingSession(ctx.meeting, ctx.agent);
    if (ctx.meeting.status === "live") s.resumeLive();
    sessions.set(meetingId, s);
    return s;
  })().finally(() => loading.delete(meetingId));
  loading.set(meetingId, p);
  return p;
}

export function dropSession(meetingId: string) {
  sessions.delete(meetingId);
}

export function allSessions() {
  return [...sessions.values()];
}
