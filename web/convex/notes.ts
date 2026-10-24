import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { callOrchestrator } from "./lib/orchestrator";

const NOTES_MODEL = "claude-sonnet-5-5";

const NotesSchema = z.object({
  title: z.string().describe("A short meeting title, 3 to 7 words, no date."),
  markdown: z.string().describe("The meeting notes in Markdown."),
});

function fmtTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Converts the small subset of Markdown we generate into Slack mrkdwn. */
function toSlack(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "<$2|$1>")
    .replace(/^(\s*)[-*]\s+/gm, "$1• ");
}

async function postToSlack(channel: string, text: string) {
  const token = env.SLACK_BOT_TOKEN;
  if (!token || !channel) return undefined;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text, unfurl_links: false, mrkdwn: true }),
  });
  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  if (!data.ok) {
    console.error("Slack post failed:", data.error);
    return undefined;
  }
  return data.ts;
}

/** End of call: write notes, post them to Slack, save them, and add them to memory. */
export const generate = internalAction({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    const data = await ctx.runQuery(internal.notesData.forNotes, { meetingId });
    if (!data || data.hasNotes) return;
    const { meeting, agent, transcript, board, answers, relays } = data;

    const date = new Date(meeting.startedAt).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    let title = `Meeting on ${date}`;
    let markdown: string;

    if (transcript.length === 0) {
      markdown = "_Nothing was said while I was in the call, so there are no notes._";
    } else if (!env.ANTHROPIC_API_KEY) {
      markdown = "_Notes couldn't be generated: ANTHROPIC_API_KEY isn't set on the Convex deployment._";
    } else {
      const transcriptText = transcript
        .map((s) => `[${fmtTime(s.startTime)}] ${s.speaker}: ${s.text}`)
        .join("\n");
      const boardText = board
        .map((n) => `- (${n.column}) ${n.text}${n.owner ? ` [owner: ${n.owner}]` : ""}`)
        .join("\n");
      const answersText = answers
        .map((a) => `- ${a.askedBy} asked: ${a.question}\n  Answer: ${a.spokenAnswer}${a.sourceUrl ? `\n  Source: ${a.sourceUrl}` : ""}`)
        .join("\n");
      const relayText = relays
        .map((r) => `- ${r.fromName} (via Slack): ${r.message}\n  Team answer: ${r.teamAnswer ?? "(no answer)"}`)
        .join("\n");

      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const prompt = `You are ${agent.name}, an AI teammate who sat in on a team meeting on ${date}. Write the meeting notes that will be posted to the team's Slack channel.

What the team wants in the notes (follow this):
${agent.postMeetingInstructions}

Always include, if there were any:
- Decisions
- Action items grouped by owner
- Questions ${agent.name} answered, each with its source link

Rules:
- Use Markdown with "## " section headings and "- " bullets. No tables.
- Be concise and concrete. Use names from the transcript.
- Only state what was actually said. Don't invent owners or dates.

<transcript>
${transcriptText}
</transcript>

<final_whiteboard>
${boardText || "(empty)"}
</final_whiteboard>

<questions_answered>
${answersText || "(none)"}
</questions_answered>

<messages_relayed_from_slack>
${relayText || "(none)"}
</messages_relayed_from_slack>`;

      let parsed: z.infer<typeof NotesSchema> | null = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        try {
          const response = await client.messages.parse({
            model: NOTES_MODEL,
            max_tokens: 8000,
            output_config: { effort: "medium", format: zodOutputFormat(NotesSchema) },
            messages: [{ role: "user", content: prompt }],
          });
          parsed = response.parsed_output ?? null;
        } catch (e) {
          console.error("Notes generation failed", e);
        }
      }
      if (parsed) {
        title = parsed.title.trim() || title;
        markdown = parsed.markdown.trim();
      } else {
        markdown = "_Notes couldn't be generated for this meeting._";
      }
    }

    const slackText = `*${title}* · ${date}\n\n${toSlack(markdown)}`;
    const slackMessageTs = await postToSlack(agent.slackChannelId, slackText);

    const noteDocId = `notes:${meetingId}`;
    let mossDocIds: string[] = [];
    if (transcript.length > 0) {
      try {
        await callOrchestrator("/memory/add-docs", {
          indexName: agent.mossIndexName,
          docs: [
            {
              id: noteDocId,
              text: `Meeting notes: ${title} (${date})\n\n${markdown}`,
              metadata: { source: "notes", meetingId, date, title },
            },
          ],
        });
        mossDocIds = [noteDocId];
      } catch (e) {
        console.error("Adding notes to memory failed", e);
      }
    }

    await ctx.runMutation(internal.notesData.save, {
      meetingId,
      title,
      markdown,
      slackMessageTs,
      mossDocIds,
    });
  },
});
