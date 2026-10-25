import { config } from "./config.js";
import { logger } from "./log.js";

const log = logger("contextdev");

const API_URL = "https://api.context.dev/v1/web";

/** Highlight text kept per search result, so Claude can usually answer without read_page. */
const RESULT_CONTENT_CHARS = 1500;

/** Pages read with read_page may come from context.dev's cache if they're under a day old. */
const PAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type SearchResult = { title: string; url: string; snippet: string; content: string };

/** Every web call is logged with query, status and time taken, for the demo and README. */
export type WebCallLog = {
  tool: string;
  input: string;
  status: string;
  ms: number;
};

type SearchResponse = {
  results?: {
    url?: string;
    title?: string;
    description?: string;
    highlights?: { highlights?: string[] | null };
  }[];
};

type ScrapeResponse = { markdown?: { success?: boolean | null; data?: string | null } };

/**
 * POSTs to context.dev. The API gets a slightly shorter deadline than our abort and returns what it has
 * at that point, so a slow page gives partial results instead of a timeout.
 */
async function contextDev<T>(path: string, body: Record<string, unknown>, timeoutMs: number) {
  if (!config.contextDev.apiKey) throw new Error("context.dev isn't configured (CONTEXT_DEV_API_KEY).");
  const res = await fetch(`${API_URL}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.contextDev.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...body,
      timeoutOpts: { milliseconds: Math.max(1000, timeoutMs - 1000), behavior: "return-partial" },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  return JSON.parse(text) as T;
}

/** Web results with the passages of each page that match the query, through context.dev search. */
export async function webSearch(
  query: string,
  timeoutMs: number,
): Promise<{ results: SearchResult[]; log: WebCallLog }> {
  const started = Date.now();
  try {
    const data = await contextDev<SearchResponse>(
      "search",
      { query, numResults: 3, highlightsOptions: { enabled: true, maxCharacters: RESULT_CONTENT_CHARS } },
      timeoutMs,
    );
    const results = (data.results ?? [])
      .map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.description ?? "",
        content: (r.highlights?.highlights ?? []).join("\n\n").slice(0, RESULT_CONTENT_CHARS),
      }))
      .filter((r) => r.url);
    const ms = Date.now() - started;
    const status = results.length ? "ok" : "empty";
    log.info(`web_search "${query}" → ${status} (${results.length}) in ${ms}ms`);
    return { results, log: { tool: "web_search", input: query, status, ms } };
  } catch (e) {
    const ms = Date.now() - started;
    const status = (e as Error).name === "TimeoutError" ? "timeout" : "error";
    log.warn(`web_search "${query}" → ${status} in ${ms}ms: ${(e as Error).message}`);
    return {
      results: [],
      log: { tool: "web_search", input: query, status, ms },
    };
  }
}

/** Reads one page's main content as markdown through context.dev scrape and returns the first 4,000 characters. */
export async function readPage(url: string, timeoutMs: number): Promise<{ text: string | null; log: WebCallLog }> {
  const started = Date.now();
  try {
    const data = await contextDev<ScrapeResponse>(
      "scrape",
      {
        url,
        formats: { markdown: true },
        markdownParams: { includeLinks: false, includeImages: false },
        sharedParams: { mainContentOnly: true },
        maxAgeMs: PAGE_MAX_AGE_MS,
      },
      timeoutMs,
    );
    const text = (data.markdown?.data ?? "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 4000);
    const ms = Date.now() - started;
    const status = text ? "ok" : "empty";
    log.info(`read_page ${url} → ${status} in ${ms}ms`);
    return {
      text: text || null,
      log: { tool: "read_page", input: url, status, ms },
    };
  } catch (e) {
    const ms = Date.now() - started;
    const status = (e as Error).name === "TimeoutError" ? "timeout" : "blocked";
    log.warn(`read_page ${url} → ${status} in ${ms}ms: ${(e as Error).message}`);
    return { text: null, log: { tool: "read_page", input: url, status, ms } };
  }
}
