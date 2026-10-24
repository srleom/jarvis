import { App, LogLevel } from "@slack/bolt";
import { z } from "zod";
import { complete, FAST_MODEL, STRONG_MODEL, structured } from "./claude.js";
import { config } from "./config.js";
import { api, convex, secret, type Doc, type Id } from "./convex.js";
import { logger } from "./log.js";
import * as memory from "./memory.js";
import { setDmSender } from "./notify.js";
import { loadSession } from "./session.js";

const log = logger("slack");

type Candidate = {
  agent: Doc<"agents">;
  memberName: string;
  liveMeetingId: Id<"meetings"> | null;
  latestMeetingId: Id<"meetings"> | null;
  latestMeetingAt: number;
};

/** People who were asked "which agent?" and the message they originally sent. */
const pendingChoice = new Map<string, { candidates: Candidate[]; text: string; at: number }>();

const Intent = z.object({
  intent: z.enum(["catch_up", "question", "relay", "other"]),
  relay_message: z
    .string()
    .nullable()
    .describe("For relay: the message to pass to the team, in the sender's words, without 'tell the team'."),
});

const Preview = z.object({
  preview: z.string().describe('One line under 10 words, e.g. "Ben has a message about setup time."'),
});

function prefix(agent: Doc<"agents">, text: string) {
  return agent.name.toLowerCase() === "jarvis" ? text : `${agent.name}: ${text}`;
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${m}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

function when(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** Board + recent transcript (or saved notes) for a meeting, as prompt text. */
async function meetingContext(meetingId: Id<"meetings">, transcriptLimit = 400) {
  const d = await convex.query(api.orchestrator.meetingDigest, {
    secret,
    meetingId,
    transcriptLimit,
  });
  if (!d) return null;
  const live = d.meeting.status === "live" || d.meeting.status === "joining";
  const board = d.board.map((n) => `- [${n.column}] ${n.text}${n.owner ? ` (owner: ${n.owner})` : ""}`).join("\n");
  const transcript = d.transcript.map((s) => `[${clock(s.startTime)}] ${s.speaker}: ${s.text}`).join("\n");
  return {
    live,
    title: d.meeting.title,
    startedAt: d.meeting.startedAt,
    text: `${live ? `This meeting is happening right now (started ${when(d.meeting.startedAt)}).` : `This meeting ended. Title: ${d.meeting.title ?? "untitled"}. It started ${when(d.meeting.startedAt)}.`}
<whiteboard>
${board || "(empty)"}
</whiteboard>
<transcript>
${transcript || "(nothing said yet)"}
</transcript>${d.notes ? `\n<meeting_notes>\n${d.notes.markdown}\n</meeting_notes>` : ""}`,
  };
}

async function pickAgent(
  userId: string,
  text: string,
): Promise<{ candidate: Candidate; text: string } | { reply: string }> {
  const pending = pendingChoice.get(userId);
  if (pending && Date.now() - pending.at < 10 * 60_000) {
    const t = text.trim().toLowerCase();
    const byIndex = Number.parseInt(t, 10);
    const chosen =
      (Number.isFinite(byIndex) ? pending.candidates[byIndex - 1] : undefined) ??
      pending.candidates.find((c) => t.includes(c.agent.name.toLowerCase()));
    if (chosen) {
      pendingChoice.delete(userId);
      return { candidate: chosen, text: pending.text };
    }
  }

  const candidates = (await convex.query(api.orchestrator.agentsForSlackUser, {
    secret,
    slackUserId: userId,
  })) as Candidate[];
  if (candidates.length === 0) {
    return {
      reply:
        "Hi! You're not on any agent's team yet, so I can't share meeting details with you. Ask your team lead to add you on the dashboard.",
    };
  }
  const live = candidates.filter((c) => c.liveMeetingId);
  if (live.length === 1) return { candidate: live[0]!, text };
  if (live.length > 1) {
    pendingChoice.set(userId, { candidates: live, text, at: Date.now() });
    return {
      reply: `More than one of your agents is in a meeting right now. Which one do you mean?\n${live
        .map((c, i) => `${i + 1}. ${c.agent.name}`)
        .join("\n")}`,
    };
  }
  const recent = [...candidates].sort((a, b) => b.latestMeetingAt - a.latestMeetingAt)[0]!;
  return { candidate: recent, text };
}

async function handleDM(userId: string, rawText: string): Promise<string> {
  const picked = await pickAgent(userId, rawText);
  if ("reply" in picked) return picked.reply;
  const { candidate, text } = picked;
  const { agent, memberName } = candidate;

  const intent = await structured(Intent, {
    model: FAST_MODEL,
    system: `You route Slack DMs sent to ${agent.name}, an AI teammate that sits in the team's meetings.
- catch_up: they want a summary of the meeting ("what did I miss?", "catch me up").
- question: a question about the meeting or past meetings ("did we pick a venue?").
- relay: they want a message passed to the people in the call ("tell the team...", "let them know...").
- other: anything else (greetings, thanks, requests Jarvis can't do).`,
    prompt: text,
    maxTokens: 400,
  });
  const kind = intent?.intent ?? "other";
  log.info(`DM from ${memberName} → ${agent.name}: ${kind}`);

  const meetingId = candidate.liveMeetingId ?? candidate.latestMeetingId;

  if (kind === "relay") {
    if (!candidate.liveMeetingId) {
      return prefix(
        agent,
        "There's no meeting running right now, so I can't pass that on. Try again once the team is in a call.",
      );
    }
    const message = intent?.relay_message?.trim() || text;
    const session = await loadSession(candidate.liveMeetingId);
    if (!session) return prefix(agent, "I couldn't reach the meeting just now. Please try again in a moment.");
    const preview =
      (
        await structured(Preview, {
          model: FAST_MODEL,
          prompt: `Write a one-line preview for a raised hand in a meeting. The sender is ${memberName}. Their message: "${message}". Say who it's from and what it's about, without revealing the details. Example: "Ben has a message about setup time."`,
          maxTokens: 200,
        })
      )?.preview ?? `${memberName.split(" ")[0]} has a message for the team.`;
    const relayId = await convex.mutation(api.orchestrator.createRelay, {
      secret,
      meetingId: candidate.liveMeetingId,
      fromSlackUserId: userId,
      fromName: memberName,
      message,
      preview,
    });
    session.enqueueRelay({
      relayId,
      fromSlackUserId: userId,
      fromName: memberName,
      message,
      preview,
    });
    return prefix(agent, "Got it, I'll raise it with the team.");
  }

  if (kind === "catch_up") {
    if (!meetingId) return prefix(agent, "There haven't been any meetings yet, so there's nothing to catch up on.");
    const ctx = await meetingContext(meetingId);
    if (!ctx) return prefix(agent, "I couldn't find that meeting.");
    const summary = await complete({
      model: STRONG_MODEL,
      system: `You are ${agent.name}, an AI teammate. ${memberName} missed part of a meeting and wants to catch up on Slack. ${agent.behaviourInstructions}`,
      prompt: `${ctx.text}

Write a short catch-up for ${memberName.split(" ")[0]} with three parts: what's been discussed, what's been decided, and what's still open. Use Slack formatting: *bold* labels and "•" bullets. Keep it under 120 words. Only include what was actually said.`,
      maxTokens: 1000,
      effort: "low",
    });
    const intro = ctx.live
      ? "Here's what you've missed so far:"
      : `The last meeting${ctx.title ? ` (${ctx.title})` : ""} has ended. Here's the recap:`;
    return prefix(agent, `${intro}\n\n${summary ?? "Sorry, I couldn't put a summary together just now."}`);
  }

  if (kind === "question") {
    const [ctx, hits, recent] = await Promise.all([
      meetingId ? meetingContext(meetingId, 300) : Promise.resolve(null),
      memory.search(agent.mossIndexName, text, 8).catch(() => []),
      convex.query(api.orchestrator.recentMeetings, {
        secret,
        agentId: agent._id,
        limit: 10,
      }),
    ]);
    const dates = new Map(recent.map((m) => [m.meetingId as string, when(m.startedAt)]));
    const mem = hits
      .map((h, i) => {
        const date = h.meetingId ? dates.get(h.meetingId) : undefined;
        return `[${i + 1}] (${h.label}${date ? `, meeting on ${date}` : ""}) ${h.text}`;
      })
      .join("\n\n");
    const past = recent
      .map(
        (m) =>
          `- ${when(m.startedAt)}: ${m.title ?? "untitled"} (${m.status})${m.notesExcerpt ? `\n  ${m.notesExcerpt.replace(/\n+/g, " ")}` : ""}`,
      )
      .join("\n");
    const answer = await complete({
      model: STRONG_MODEL,
      system: `You are ${agent.name}, an AI teammate answering a teammate's question on Slack. Answer only from the meeting context, past meetings list and memory below. The question can be about any past meeting, not just the latest one. When it matters, say which meeting and when it happened. If the answer isn't there, say so. Keep it to two or three sentences. ${agent.behaviourInstructions}`,
      prompt: `Current time: ${when(Date.now())}

<latest_or_live_meeting>
${ctx?.text ?? "(no meetings yet)"}
</latest_or_live_meeting>

<past_meetings>
${past || "(none)"}
</past_meetings>

<memory>
${mem || "(nothing relevant)"}
</memory>

${memberName} asks: ${text}`,
      maxTokens: 800,
      effort: "low",
    });
    return prefix(agent, answer ?? "Sorry, I couldn't answer that just now.");
  }

  return prefix(
    agent,
    `I'm ${agent.name}, your team's meeting teammate. You can DM me:\n• "What have I missed?" for a catch-up on the current call\n• A question like "Did we pick a venue?"\n• "Tell the team …" and I'll raise my hand and read it out in the call, then send you their answer`,
  );
}

export async function startSlack() {
  if (!config.slack.botToken || !config.slack.appToken) {
    log.warn("SLACK_BOT_TOKEN / SLACK_APP_TOKEN not set; Slack bot disabled");
    return;
  }
  const app = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });

  setDmSender(async (slackUserId, text) => {
    await app.client.chat.postMessage({ channel: slackUserId, text });
  });

  app.message(async ({ message, say }) => {
    if (message.channel_type !== "im") return;
    if ("subtype" in message && message.subtype) return;
    if (!("user" in message) || !message.user || !("text" in message) || !message.text) return;
    if ("bot_id" in message && message.bot_id) return;
    try {
      const reply = await handleDM(message.user, message.text);
      await say(reply);
    } catch (e) {
      log.error(`DM handling failed: ${(e as Error).message}`);
      await say("Sorry, something went wrong on my side. Please try again.");
    }
  });

  await app.start();
  log.info("Slack bot connected (Socket Mode)");
}
