import { config } from "./config.js";
import { logger } from "./log.js";

const log = logger("apify");

/** Apify's RAG Web Browser actor in Standby mode: Google search plus page scraping in one call. */
const RAG_BROWSER_URL = "https://rag-web-browser.apify.actor/search";

/** Page text kept per search result, so Claude can usually answer without read_page. */
const RESULT_CONTENT_CHARS = 1500;

export type SearchResult = { title: string; url: string; snippet: string; content: string };

/** Every web call is logged with query, status and time taken, for the demo and README. */
export type WebCallLog = {
  tool: string;
  input: string;
  status: string;
  ms: number;
};

type RagItem = {
  crawl?: { httpStatusCode?: number; requestStatus?: string };
  searchResult?: { title?: string; url?: string; description?: string };
  metadata?: { title?: string; url?: string; description?: string };
  markdown?: string;
};

/** Drops images and link targets, which would otherwise use up most of the character budget. */
function tidy(markdown: string | undefined, max: number) {
  return (markdown ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/**
 * Calls the RAG Web Browser. `query` is search keywords or a single URL.
 * The actor gets a slightly shorter budget than our abort, so on a slow page it returns what it has.
 */
async function ragBrowser(query: string, params: Record<string, string>, timeoutMs: number) {
  if (!config.apify.token) throw new Error("Apify isn't configured (APIFY_TOKEN).");
  const search = new URLSearchParams({
    query,
    outputFormats: "markdown",
    requestTimeoutSecs: String(Math.max(1, Math.floor(timeoutMs / 1000) - 1)),
    ...params,
  });
  const res = await fetch(`${RAG_BROWSER_URL}?${search}`, {
    headers: { Authorization: `Bearer ${config.apify.token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
  return JSON.parse(body) as RagItem[];
}

/** Google results with the text of each result page, through the RAG Web Browser. */
export async function webSearch(
  query: string,
  timeoutMs: number,
): Promise<{ results: SearchResult[]; log: WebCallLog }> {
  const started = Date.now();
  try {
    const items = await ragBrowser(query, { maxResults: "3", scrapingTool: "raw-http" }, timeoutMs);
    const results = items
      .map((r) => ({
        title: r.searchResult?.title ?? r.metadata?.title ?? "",
        url: r.searchResult?.url ?? r.metadata?.url ?? "",
        snippet: r.searchResult?.description ?? r.metadata?.description ?? "",
        content: tidy(r.markdown, RESULT_CONTENT_CHARS),
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

/** Reads one page as markdown through the RAG Web Browser and returns the first 4,000 characters. */
export async function readPage(url: string, timeoutMs: number): Promise<{ text: string | null; log: WebCallLog }> {
  const started = Date.now();
  try {
    const items = await ragBrowser(url, {}, timeoutMs);
    const text = tidy(items[0]?.markdown, 4000);
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
