import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, STRONG_MODEL } from "./claude.js";
import { logger } from "./log.js";
import * as memory from "./memory.js";
import { readPage, webSearch, type WebCallLog } from "./web.js";

const log = logger("qa");

const MAX_TOOL_CALLS = 4;
const TOOL_BUDGET_MS = 8000;

const AnswerSchema = z.object({
  spoken_answer: z.string().describe("One to three short spoken sentences. No markdown, no URLs."),
  board_note: z.string().describe("Under 12 words, for the Answers column of the whiteboard."),
  source_url: z
    .string()
    .nullable()
    .describe("URL of the main web source used, or null if the answer came from the call or memory."),
});
export type Answer = z.infer<typeof AnswerSchema> & { toolLog: WebCallLog[] };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_memory",
    description:
      "Search the team's memory: project state (the team's current agreed facts), uploaded context documents (briefs, budgets), earlier parts of this call, and notes from past meetings. Each result shows its source and date. Use for anything about the team's own plans or decisions.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "web_search",
    description:
      "Search the public web (Google). Returns the top 5 results with title, URL and snippet. Use for facts, prices, dates and anything outside the team's own documents.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "read_page",
    description:
      "Read a web page from search results when the snippets aren't enough. Returns the first 4,000 characters as text. If a page fails, try another result.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function systemPrompt(agentName: string, behaviour: string) {
  return `You are ${agentName}, an AI teammate sitting in a live Google Meet call with a small team. Someone just asked you a question out loud and you will answer by voice.

How to answer:
- Answer in one to three short sentences that sound natural when spoken. No lists, markdown or URLs in the spoken answer.
- Use what was said in the call when it's relevant (for example a budget someone mentioned), and say so briefly ("you said 10k earlier").
- Use tools only when you need them. Prefer search_memory for the team's own plans; use web_search for public facts. Read a page only if the snippets don't answer it.
- Memory results carry dates. Project state is the team's latest agreed facts. If memory sources disagree, trust project state first, then the newer date, and mention the change briefly ("the brief says 50k, but you cut it to 40k on March 3").
- Never guess facts. If the web search returned nothing or failed, say you couldn't confirm it online and answer from what you have.
- When an answer comes from the web, set source_url to the page you relied on.

Team instructions (follow these):
${behaviour || "(none)"}`;
}

/**
 * Answers a spoken question with Claude and up to 4 tool calls within an 8-second tool budget.
 * When the budget runs out, Claude answers with what it has.
 */
export async function answerQuestion(opts: {
  agentName: string;
  behaviour: string;
  indexName: string;
  question: string;
  askedBy: string;
  recentTranscript: string;
}): Promise<Answer> {
  const toolLog: WebCallLog[] = [];
  const started = Date.now();
  let toolCalls = 0;
  let toolMs = 0;
  let webFailed = false;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `<recent_transcript>
${opts.recentTranscript || "(nothing yet)"}
</recent_transcript>

${opts.askedBy} asks: ${opts.question}`,
    },
  ];

  for (let turn = 0; turn < 6; turn++) {
    const budgetLeft = toolCalls < MAX_TOOL_CALLS && toolMs < TOOL_BUDGET_MS;
    let res;
    try {
      res = await anthropic.messages.parse({
        model: STRONG_MODEL,
        max_tokens: 4000,
        system: systemPrompt(opts.agentName, opts.behaviour),
        tools: TOOLS,
        tool_choice: budgetLeft ? { type: "auto" } : { type: "none" },
        output_config: { effort: "low", format: zodOutputFormat(AnswerSchema) },
        messages,
      });
    } catch (e) {
      log.error(`answer call failed: ${(e as Error).message}`);
      break;
    }

    if (res.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: res.content });
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const results = await Promise.all(
        uses.map(async (use): Promise<Anthropic.ToolResultBlockParam> => {
          if (toolCalls >= MAX_TOOL_CALLS || toolMs >= TOOL_BUDGET_MS) {
            return {
              type: "tool_result",
              tool_use_id: use.id,
              content: "Time is up. Answer with what you have.",
              is_error: true,
            };
          }
          toolCalls++;
          const remaining = Math.max(1500, TOOL_BUDGET_MS - toolMs);
          const t0 = Date.now();
          const out = await runTool(use, opts.indexName, remaining, toolLog);
          toolMs += Date.now() - t0;
          if (out.webFailed) webFailed = true;
          return {
            type: "tool_result",
            tool_use_id: use.id,
            content: out.content,
            is_error: out.isError,
          };
        }),
      );
      messages.push({ role: "user", content: results });
      continue;
    }

    const parsed = AnswerSchema.safeParse(res.parsed_output);
    if (parsed.success) {
      log.info(`answered in ${Date.now() - started}ms with ${toolCalls} tool call(s)`);
      return { ...parsed.data, toolLog };
    }
    // Retry once by asking for the structured answer again.
    if (turn < 5) {
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: "Give your final answer now in the required JSON format.",
      });
      continue;
    }
    break;
  }

  return {
    spoken_answer: webFailed
      ? "Sorry, I couldn't confirm that online just now."
      : "Sorry, I couldn't work that out just now.",
    board_note: "",
    source_url: null,
    toolLog,
  };
}

async function runTool(
  use: Anthropic.ToolUseBlock,
  indexName: string,
  timeoutMs: number,
  toolLog: WebCallLog[],
): Promise<{ content: string; isError?: boolean; webFailed?: boolean }> {
  const input = use.input as Record<string, string>;
  switch (use.name) {
    case "search_memory": {
      const t0 = Date.now();
      try {
        const hits = await memory.search(indexName, input.query ?? "", 5);
        toolLog.push({
          tool: "search_memory",
          input: input.query ?? "",
          status: hits.length ? "ok" : "empty",
          ms: Date.now() - t0,
        });
        if (!hits.length) return { content: "No matching memory." };
        return {
          content: hits.map((h, i) => `[${i + 1}] (${h.label})\n${h.text}`).join("\n\n"),
        };
      } catch (e) {
        toolLog.push({
          tool: "search_memory",
          input: input.query ?? "",
          status: "error",
          ms: Date.now() - t0,
        });
        return {
          content: `Memory search failed: ${(e as Error).message}`,
          isError: true,
        };
      }
    }
    case "web_search": {
      const { results, log: entry } = await webSearch(input.query ?? "", timeoutMs);
      toolLog.push(entry);
      if (entry.status !== "ok") {
        return {
          content:
            entry.status === "empty"
              ? "The search returned no results."
              : `The web search ${entry.status === "timeout" ? "timed out" : "failed"}.`,
          isError: entry.status !== "empty",
          webFailed: true,
        };
      }
      return {
        content: results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join("\n\n"),
      };
    }
    case "read_page": {
      const { text, log: entry } = await readPage(input.url ?? "", timeoutMs);
      toolLog.push(entry);
      if (!text) {
        return {
          content: `That page was ${entry.status}. Try another result.`,
          isError: true,
        };
      }
      return { content: text };
    }
    default:
      return { content: `Unknown tool ${use.name}`, isError: true };
  }
}
