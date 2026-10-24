import { z } from "zod";
import { FAST_MODEL, structured } from "./claude.js";

const NoteColumn = z.enum(["decisions", "questions", "actions"]);
const TopicStatus = z.enum(["upcoming", "active", "done", "dropped"]);

const OpsSchema = z.object({
  ops: z
    .array(
      z.object({
        op: z.enum(["add", "update", "move", "remove", "topic", "goal"]),
        id: z
          .string()
          .nullable()
          .describe(
            "Existing note id for update, move and remove. Existing topic id for topic changes. Null otherwise.",
          ),
        topicId: z.string().nullable().describe("For add: the topic the note belongs to. Null means the active topic."),
        column: NoteColumn.nullable().describe("Target column for add and move."),
        text: z.string().nullable().describe("Note text, under 12 words, or the goal for goal. For add, update, goal."),
        owner: z.string().nullable().describe("Owner's first name for action items, if one was named."),
        title: z.string().nullable().describe("Topic name, 1 to 4 words. For topic."),
        status: TopicStatus.nullable().describe("Topic status. For topic."),
        outcome: z.string().nullable().describe("Where a finished topic landed, under 14 words. For topic."),
      }),
    )
    .describe("At most 4 operations. Empty if nothing changed."),
});

export type BoardNote = {
  id: string;
  topicId?: string;
  column: string;
  text: string;
  owner?: string;
};
export type BoardTopic = {
  id: string;
  title: string;
  status: string;
  outcome?: string;
};
export type BoardOp =
  | { op: "add"; column: z.infer<typeof NoteColumn>; text: string; owner?: string; topicId?: string }
  | { op: "update"; id: string; text?: string; owner?: string }
  | { op: "move"; id: string; column: z.infer<typeof NoteColumn> }
  | { op: "remove"; id: string }
  | { op: "topic"; id?: string; title?: string; status: z.infer<typeof TopicStatus>; outcome?: string }
  | { op: "goal"; text: string };

const SYSTEM = `You maintain a live meeting whiteboard. The meeting is a list of topics (the agenda). Each topic holds notes of three kinds:
- decisions: things the team agreed on
- questions: open questions and proposals not yet agreed
- actions: action items (each with an owner if one was named)
Answers from the assistant are added by someone else. Never add them.

You get the meeting goal, the current topics, the current notes and the newest part of the transcript. Return small changes only:
- At most 4 operations. Return none if nothing meaningful changed.
- Notes are short phrases under 12 words, like sticky notes. No full sentences, no trailing periods.
- Don't duplicate a note that already exists, even if worded differently.
- When something gets decided, MOVE the existing question to decisions (and update its text if needed) instead of adding a new note.
- Action items need an owner if one was named. Use first names.
- Ignore small talk, and ignore lines spoken by the assistant itself unless the team reacts to them.

Topics:
- Exactly one topic is "active": what the team is discussing right now. Start it with a topic op, status "active", no id, and a 1 to 4 word title. Starting a new active topic parks the previous one as done.
- When the team moves on, set the old topic to "done" with a short outcome, such as the decision it reached. If the team leaves a topic with nothing settled, say that in the outcome, like "Parked, needs venue quotes".
- Go back to a finished or upcoming topic by setting its id to "active".
- Agendas change mid-meeting. If someone says what's next, adds an item, or says "we also need to cover X", add it with status "upcoming". If someone says to skip or drop an item, set that topic to "dropped". If an item is renamed or reworded, send a topic op with its id, the new title and its current status.
- Don't invent topics from small talk. Prefer an existing topic over a near-duplicate.
- Put each new note under the topic it is about with topicId. If it belongs to the active topic, leave topicId null.

Goal:
- If the meeting goal is "(none)" and the team states what the meeting is for, or the meeting title makes it obvious, set it with a goal op, in under 14 words.
- If a goal exists, only change it when the team clearly says the purpose of the meeting has changed.`;

/** Asks the fast model for whiteboard operations given the board and the new transcript lines. */
export async function proposeBoardOps(
  board: {
    notes: BoardNote[];
    topics: BoardTopic[];
    goal: string | null;
    title: string | null;
  },
  newLines: string,
  assistantName: string,
) {
  const { notes, topics } = board;
  const noteLine = (n: BoardNote) => `  - id=${n.id} [${n.column}] ${n.text}${n.owner ? ` (owner: ${n.owner})` : ""}`;
  const topicText = topics.length
    ? topics
        .map((t) => {
          const mine = notes.filter((n) => n.topicId === t.id);
          return `- topic id=${t.id} [${t.status}] ${t.title}${t.outcome ? ` (outcome: ${t.outcome})` : ""}${mine.length ? `\n${mine.map(noteLine).join("\n")}` : ""}`;
        })
        .join("\n")
    : "(no topics yet)";
  const loose = notes.filter((n) => !n.topicId || !topics.some((t) => t.id === n.topicId));

  const result = await structured(OpsSchema, {
    model: FAST_MODEL,
    system: SYSTEM,
    prompt: `The assistant is called ${assistantName}.

<meeting_title>${board.title ?? "(none)"}</meeting_title>
<meeting_goal>${board.goal ?? "(none)"}</meeting_goal>

<current_board>
${topicText}${loose.length ? `\n- notes without a topic\n${loose.map(noteLine).join("\n")}` : ""}
</current_board>

<new_transcript>
${newLines}
</new_transcript>`,
    maxTokens: 1500,
    effort: "low",
  });
  if (!result) return [];

  const noteIds = new Set(notes.map((n) => n.id));
  const topicIds = new Set(topics.map((t) => t.id));
  const ops: BoardOp[] = [];
  for (const o of result.ops.slice(0, 4)) {
    const text = o.text?.trim().replace(/\.$/, "");
    if (o.op === "goal") {
      if (text) ops.push({ op: "goal", text });
    } else if (o.op === "topic") {
      const title = o.title?.trim();
      const outcome = o.outcome?.trim().replace(/\.$/, "");
      if (!o.status) continue;
      if (o.id) {
        if (topicIds.has(o.id)) ops.push({ op: "topic", id: o.id, title, status: o.status, outcome });
      } else if (title) {
        if (o.status === "dropped" || o.status === "done") continue;
        ops.push({ op: "topic", title, status: o.status });
      }
    } else if (o.op === "add" && o.column && text) {
      ops.push({
        op: "add",
        column: o.column,
        text,
        owner: o.owner ?? undefined,
        topicId: o.topicId && topicIds.has(o.topicId) ? o.topicId : undefined,
      });
    } else if (o.op === "update" && o.id && noteIds.has(o.id) && (text || o.owner)) {
      ops.push({
        op: "update",
        id: o.id,
        text: text || undefined,
        owner: o.owner ?? undefined,
      });
    } else if (o.op === "move" && o.id && noteIds.has(o.id) && o.column) {
      ops.push({ op: "move", id: o.id, column: o.column });
      if (text) ops.push({ op: "update", id: o.id, text });
    } else if (o.op === "remove" && o.id && noteIds.has(o.id)) {
      ops.push({ op: "remove", id: o.id });
    }
  }
  return ops;
}
