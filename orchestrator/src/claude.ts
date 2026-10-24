import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { config } from "./config.js";
import { logger } from "./log.js";

const log = logger("claude");

/** Haiku class: whiteboard, classification, short previews. */
export const FAST_MODEL = "claude-haiku-5-5";
/** Sonnet class: spoken answers, summaries, relay replies. */
export const STRONG_MODEL = "claude-sonnet-5-5";

export const anthropic = new Anthropic({ apiKey: config.anthropicKey || undefined });

type Effort = "low" | "medium" | "high";

/**
 * One structured call validated against a zod schema. Retries once on failure, then returns null
 * so callers can skip the state change.
 */
export async function structured<S extends z.ZodType>(
  schema: S,
  opts: { model: string; system?: string; prompt: string; maxTokens?: number; effort?: Effort },
): Promise<z.infer<S> | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await anthropic.messages.parse({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 2000,
        system: opts.system,
        output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(schema) },
        messages: [{ role: "user", content: opts.prompt }],
      });
      if (res.stop_reason === "refusal") {
        log.warn(`${opts.model} declined the request`);
        return null;
      }
      const parsed = schema.safeParse(res.parsed_output);
      if (parsed.success) return parsed.data;
      log.warn(`invalid output from ${opts.model} (attempt ${attempt})`);
    } catch (e) {
      log.warn(`${opts.model} call failed (attempt ${attempt}): ${(e as Error).message}`);
    }
  }
  return null;
}

/** Plain text completion. Returns null on failure. */
export async function complete(opts: {
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  effort?: Effort;
}): Promise<string | null> {
  try {
    const res = await anthropic.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      output_config: { effort: opts.effort ?? "low" },
      messages: [{ role: "user", content: opts.prompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    log.warn(`${opts.model} call failed: ${(e as Error).message}`);
    return null;
  }
}
