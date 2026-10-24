import { z } from "zod";
import { FAST_MODEL, structured } from "./claude.js";

const Column = z.enum(["topics", "decisions", "questions", "actions", "answers"]);

const OpsSchema = z.object({
  ops: z
    .array(
      z.object({
        op: z.enum(["add", "update", "move", "remove"]),
        id: z.string().nullable().describe("Existing note id for update, move and remove. Null for add."),
        column: Column.nullable().describe("Target column for add and move."),
        text: z.string().nullable().describe("Note text, under 12 words. For add and update."),
        owner: z.string().nullable().describe("Owner's first name for action items, if one was named."),
      }),
    )
    .describe("At most 3 operations. Empty if nothing changed."),
});

export type BoardNote = {
  id: string;
  column: string;
  text: string;
  owner?: string;
};
export type BoardOp =
  | { op: "add"; column: z.infer<typeof Column>; text: string; owner?: string }
  | { op: "update"; id: string; text?: string; owner?: string }
  | { op: "move"; id: string; column: z.infer<typeof Column> }
  | { op: "remove"; id: string };

const SYSTEM = `You maintain a live meeting whiteboard with five fixed columns:
- topics: what's being discussed
- decisions: things the team agreed on
- questions: open questions and proposals not yet agreed
- actions: action items (each with an owner if one was named)
- answers: reserved for the assistant's answers. Never add to this column.

You get the current board and the newest part of the transcript. Return small changes only:
- At most 3 operations. Return no operations if nothing meaningful changed.
- Notes are short phrases under 12 words, like sticky notes. No full sentences, no trailing periods.
- Don't duplicate a note that already exists (even if worded differently).
- When something gets decided, MOVE the existing question note to decisions (and update its text if needed) instead of adding a new note.
- Action items need an owner if one was named. Use first names.
- Ignore small talk, and ignore lines spoken by the assistant itself unless the team reacts to them.`;

/** Asks the fast model for whiteboard operations given the board and the new transcript lines. */
export async function proposeBoardOps(board: BoardNote[], newLines: string, assistantName: string) {
  const boardText = board.length
    ? board.map((n) => `- id=${n.id} [${n.column}] ${n.text}${n.owner ? ` (owner: ${n.owner})` : ""}`).join("\n")
    : "(empty)";
  const result = await structured(OpsSchema, {
    model: FAST_MODEL,
    system: SYSTEM,
    prompt: `The assistant is called ${assistantName}.

<current_board>
${boardText}
</current_board>

<new_transcript>
${newLines}
</new_transcript>`,
    maxTokens: 1500,
    effort: "low",
  });
  if (!result) return [];

  const ids = new Set(board.map((n) => n.id));
  const ops: BoardOp[] = [];
  for (const o of result.ops.slice(0, 3)) {
    const text = o.text?.trim().replace(/\.$/, "");
    if (o.op === "add" && o.column && o.column !== "answers" && text) {
      ops.push({
        op: "add",
        column: o.column,
        text,
        owner: o.owner ?? undefined,
      });
    } else if (o.op === "update" && o.id && ids.has(o.id) && (text || o.owner)) {
      ops.push({
        op: "update",
        id: o.id,
        text: text || undefined,
        owner: o.owner ?? undefined,
      });
    } else if (o.op === "move" && o.id && ids.has(o.id) && o.column && o.column !== "answers") {
      ops.push({ op: "move", id: o.id, column: o.column });
      if (text) ops.push({ op: "update", id: o.id, text });
    } else if (o.op === "remove" && o.id && ids.has(o.id)) {
      ops.push({ op: "remove", id: o.id });
    }
  }
  return ops;
}
