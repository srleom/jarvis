import { config } from "./config.js";
import { logger } from "./log.js";

const log = logger("brightdata");

export type SearchResult = { title: string; url: string; snippet: string };

/** Every web call is logged with query, status and time taken, for the demo and README. */
export type WebCallLog = { tool: string; input: string; status: string; ms: number };

async function brightRequest(zone: string, url: string, extra: Record<string, unknown>, timeoutMs: number) {
  if (!config.brightData.apiKey || !zone) throw new Error("Bright Data isn't configured.");
  const res = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.brightData.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ zone, url, format: "raw", ...extra }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
  return body;
}

type SerpOrganic = { title?: string; link?: string; url?: string; description?: string; snippet?: string };

/** Google results through the Bright Data SERP API (parsed JSON via brd_json=1). */
export async function webSearch(query: string, timeoutMs: number): Promise<{ results: SearchResult[]; log: WebCallLog }> {
  const started = Date.now();
  const target = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&brd_json=1`;
  try {
    const raw = await brightRequest(config.brightData.serpZone, target, {}, timeoutMs);
    const data = JSON.parse(raw) as { organic?: SerpOrganic[] };
    const results = (data.organic ?? [])
      .map((r) => ({
        title: r.title ?? "",
        url: r.link ?? r.url ?? "",
        snippet: r.description ?? r.snippet ?? "",
      }))
      .filter((r) => r.url)
      .slice(0, 5);
    const ms = Date.now() - started;
    const status = results.length ? "ok" : "empty";
    log.info(`web_search "${query}" → ${status} (${results.length}) in ${ms}ms`);
    return { results, log: { tool: "web_search", input: query, status, ms } };
  } catch (e) {
    const ms = Date.now() - started;
    const status = (e as Error).name === "TimeoutError" ? "timeout" : "error";
    log.warn(`web_search "${query}" → ${status} in ${ms}ms: ${(e as Error).message}`);
    return { results: [], log: { tool: "web_search", input: query, status, ms } };
  }
}

/** Reads a page through Web Unlocker as markdown and returns the first 4,000 characters. */
export async function readPage(url: string, timeoutMs: number): Promise<{ text: string | null; log: WebCallLog }> {
  const started = Date.now();
  try {
    const raw = await brightRequest(config.brightData.unlockerZone, url, { data_format: "markdown" }, timeoutMs);
    const text = raw.replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
    const ms = Date.now() - started;
    const status = text ? "ok" : "empty";
    log.info(`read_page ${url} → ${status} in ${ms}ms`);
    return { text: text || null, log: { tool: "read_page", input: url, status, ms } };
  } catch (e) {
    const ms = Date.now() - started;
    const status = (e as Error).name === "TimeoutError" ? "timeout" : "blocked";
    log.warn(`read_page ${url} → ${status} in ${ms}ms: ${(e as Error).message}`);
    return { text: null, log: { tool: "read_page", input: url, status, ms } };
  }
}
