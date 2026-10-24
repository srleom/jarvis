import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction } from "./_generated/server";
import { postToSlack } from "./notes";

const STATE_MODEL = "claude-sonnet-5-5";
const MAX_CHANGES = 8;

const ChangesSchema = z.object({
  changes: z.array(
    z.object({
      kind: z.enum(["add", "update", "remove"]),
      fact_number: z
        .number()
        .nullable()
        .describe("The number of the existing fact this changes, for update and remove. null for add."),
      text: z
        .string()
        .describe(
          "For add and update: the full fact as one short, self-contained statement that includes the number, date or name. For remove: a short reason.",
        ),
    }),
  ),
});

/**
 * After a meeting's notes exist, compares what was decided with the project state and saves the
 * differences as proposals. Nothing changes the state until someone accepts it.
 */
export const propose = internalAction({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    if (!env.ANTHROPIC_API_KEY) return;
    const data = await ctx.runQuery(internal.state.forProposals, { meetingId });
    if (!data || data.alreadyProposed || !data.notes) return;
    const { meeting, agent, notes, board, topics, facts } = data;

    const date = new Date(meeting.startedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const factsText = facts.map((f, i) => `${i + 1}. ${f.text}`).join("\n");
    const boardText = board
      .filter((n) => n.column === "decisions" || n.column === "actions" || n.column === "answers")
      .map((n) => `- (${n.column}) ${n.text}${n.owner ? ` [owner: ${n.owner}]` : ""}`)
      .join("\n");
    const outcomes = topics
      .filter((t) => t.outcome)
      .map((t) => `- ${t.title}: ${t.outcome}`)
      .join("\n");

    const prompt = `You keep the "project state" for a team: a short list of facts that are currently true about their project (budgets, dates, venues, vendors, owners, scope, decisions). A meeting on ${date} just ended. Compare what was decided with the current list and propose changes.

Rules:
- Only propose durable facts the team would need to look up later. Skip discussion, opinions, small talk and one-off tasks.
- "update" when a decision changes an existing fact (a new budget, a moved date). Quote the new value in full. "remove" when a fact is clearly no longer true. "add" for a new durable fact.
- Only use what the meeting actually settled. If it was only discussed or left open, don't propose it.
- Never repeat a fact that is already in the list unchanged.
- Each fact is one short sentence with the concrete value, e.g. "Venue budget is $40k (was $50k)".
- Return at most ${MAX_CHANGES} changes. Return an empty list if nothing durable changed.

<current_project_state>
${factsText || "(empty)"}
</current_project_state>

<meeting_notes>
${notes.markdown}
</meeting_notes>

<whiteboard_decisions_and_actions>
${boardText || "(none)"}
</whiteboard_decisions_and_actions>

<topic_outcomes>
${outcomes || "(none)"}
</topic_outcomes>`;

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    let parsed: z.infer<typeof ChangesSchema> | null = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const response = await client.messages.parse({
          model: STATE_MODEL,
          max_tokens: 4000,
          output_config: { effort: "medium", format: zodOutputFormat(ChangesSchema) },
          messages: [{ role: "user", content: prompt }],
        });
        parsed = response.parsed_output ?? null;
      } catch (e) {
        console.error("Project state proposal failed", e);
      }
    }
    if (!parsed) return;

    const known = new Set(facts.map((f) => f.text.trim().toLowerCase()));
    const touched = new Set<number>();
    const changes: {
      kind: "add" | "update" | "remove";
      text: string;
      factId?: Id<"stateFacts">;
      previousText?: string;
    }[] = [];

    for (const c of parsed.changes) {
      const text = c.text.trim().replace(/\s+/g, " ").slice(0, 400);
      if (!text) continue;
      if (c.kind === "add") {
        if (known.has(text.toLowerCase())) continue;
        known.add(text.toLowerCase());
        changes.push({ kind: "add", text });
        continue;
      }
      // The model refers to facts by their number in the list, so ignore numbers that don't exist.
      const index = c.fact_number === null ? -1 : c.fact_number - 1;
      const fact = facts[index];
      if (!fact || touched.has(index)) continue;
      if (c.kind === "update" && text.toLowerCase() === fact.text.trim().toLowerCase()) continue;
      touched.add(index);
      changes.push({ kind: c.kind, text, factId: fact._id, previousText: fact.text });
    }
    const limited = changes.slice(0, MAX_CHANGES);
    if (limited.length === 0) return;

    const count = await ctx.runMutation(internal.state.insertProposals, {
      agentId: agent._id,
      meetingId,
      changes: limited,
    });
    if (count > 0 && agent.slackChannelId) {
      await postToSlack(
        agent.slackChannelId,
        `${count} proposed update${count === 1 ? "" : "s"} to the project state ${
          count === 1 ? "is" : "are"
        } waiting for review in ${agent.name}'s Memory tab.`,
        notes.slackMessageTs,
      );
    }
  },
});
