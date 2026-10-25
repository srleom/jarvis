/**
 * Times web search through Bright Data, Apify and context.dev on the same meeting-style questions, so we
 * can pick a provider on real numbers. Each variant is called one at a time, rotating the order per query
 * so no provider always goes first. Skips any provider whose keys are missing from .env.
 *
 *   BRIGHT_DATA_API_KEY, BRIGHT_DATA_SERP_ZONE, BRIGHT_DATA_UNLOCKER_ZONE
 *   APIFY_TOKEN
 *   CONTEXT_DEV_API_KEY
 *
 *   pnpm bench:search                   # every variant, every query, once
 *   pnpm bench:search --runs 2          # repeat (context.dev's second run will mostly be cache hits)
 *   pnpm bench:search --only apify,ctx-highlights
 */
import { parseArgs } from "node:util";

const TIMEOUT_MS = 30_000;
const RESULTS = 3;
const CONTENT_CHARS = 1500;

const QUERIES = [
  "current Fed funds rate",
  "who is the CEO of Stripe",
  "Next.js latest stable version",
  "population of Singapore 2026",
  "OpenAI GPT latest model release",
  "Convex database pricing",
  "what is the capital of Australia",
  "Recall.ai meeting bot pricing",
  "Apple stock price today",
  "how many employees does Shopify have",
];

type Outcome = { status: string; results: number; contentChars: number; note?: string };
type Variant = { name: string; ready: boolean; run: (query: string) => Promise<Outcome> };

const env = process.env;

async function post(url: string, token: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  return text;
}

// Bright Data: the SERP API gives snippets only, so "+unlocker" also reads the top results in parallel,
// which is what Apify and context.dev's markdown mode do in one call.

type SerpOrganic = { link?: string; url?: string; description?: string };

async function brightSerp(query: string) {
  const target = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&brd_json=1`;
  const raw = await post("https://api.brightdata.com/request", env.BRIGHT_DATA_API_KEY ?? "", {
    zone: env.BRIGHT_DATA_SERP_ZONE,
    url: target,
    format: "raw",
  });
  const data = JSON.parse(raw) as { organic?: SerpOrganic[] };
  return (data.organic ?? []).filter((r) => r.link ?? r.url).slice(0, RESULTS);
}

async function brightUnlock(url: string) {
  return post("https://api.brightdata.com/request", env.BRIGHT_DATA_API_KEY ?? "", {
    zone: env.BRIGHT_DATA_UNLOCKER_ZONE,
    url,
    format: "raw",
    data_format: "markdown",
  });
}

// Apify: the same RAG Web Browser call web.ts makes.

type RagItem = { markdown?: string };

async function apify(query: string): Promise<Outcome> {
  const search = new URLSearchParams({
    query,
    outputFormats: "markdown",
    requestTimeoutSecs: String(TIMEOUT_MS / 1000 - 1),
    maxResults: String(RESULTS),
    scrapingTool: "raw-http",
  });
  const res = await fetch(`https://rag-web-browser.apify.actor/search?${search}`, {
    headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
  const items = JSON.parse(body) as RagItem[];
  const chars = items.reduce((n, r) => n + Math.min(r.markdown?.length ?? 0, CONTENT_CHARS), 0);
  return { status: items.length ? "ok" : "empty", results: items.length, contentChars: chars };
}

// context.dev: search alone, with highlights, and with markdown (cached, then forced fresh).

type CtxResult = {
  description?: string;
  markdown?: { markdown?: string | null; code?: string };
  highlights?: { highlights?: string[] | null; code?: string };
};
type CtxResponse = { results?: CtxResult[]; cache_metadata?: { status?: string; age_ms?: number } };

async function contextDev(query: string, extra: Record<string, unknown>): Promise<Outcome> {
  const raw = await post("https://api.context.dev/v1/web/search", env.CONTEXT_DEV_API_KEY ?? "", {
    query,
    numResults: RESULTS,
    timeoutOpts: { milliseconds: TIMEOUT_MS - 1000, behavior: "return-partial" },
    ...extra,
  });
  const data = JSON.parse(raw) as CtxResponse;
  const results = data.results ?? [];
  const chars = results.reduce((n, r) => {
    const text = r.markdown?.markdown ?? r.highlights?.highlights?.join("\n") ?? r.description ?? "";
    return n + Math.min(text.length, CONTENT_CHARS);
  }, 0);
  const cache = data.cache_metadata?.status ?? "?";
  return { status: results.length ? "ok" : "empty", results: results.length, contentChars: chars, note: cache };
}

const hasBright = !!env.BRIGHT_DATA_API_KEY && !!env.BRIGHT_DATA_SERP_ZONE;
const hasCtx = !!env.CONTEXT_DEV_API_KEY;

const VARIANTS: Variant[] = [
  {
    name: "bright-serp",
    ready: hasBright,
    run: async (q) => {
      const organic = await brightSerp(q);
      const chars = organic.reduce((n, r) => n + (r.description?.length ?? 0), 0);
      return { status: organic.length ? "ok" : "empty", results: organic.length, contentChars: chars };
    },
  },
  {
    name: "bright-serp+unlocker",
    ready: hasBright && !!env.BRIGHT_DATA_UNLOCKER_ZONE,
    run: async (q) => {
      const organic = await brightSerp(q);
      const pages = await Promise.allSettled(organic.map((r) => brightUnlock(r.link ?? r.url ?? "")));
      const read = pages.filter((p) => p.status === "fulfilled");
      const chars = read.reduce((n, p) => n + Math.min(p.value.length, CONTENT_CHARS), 0);
      return {
        status: read.length ? "ok" : "empty",
        results: organic.length,
        contentChars: chars,
        note: `${read.length}/${organic.length} read`,
      };
    },
  },
  { name: "apify", ready: !!env.APIFY_TOKEN, run: apify },
  { name: "ctx-search", ready: hasCtx, run: (q) => contextDev(q, {}) },
  {
    name: "ctx-highlights",
    ready: hasCtx,
    run: (q) => contextDev(q, { highlightsOptions: { enabled: true, maxCharacters: CONTENT_CHARS } }),
  },
  {
    name: "ctx-markdown",
    ready: hasCtx,
    run: (q) => contextDev(q, { markdownOptions: { enabled: true, useMainContentOnly: true } }),
  },
  {
    name: "ctx-markdown-fresh",
    ready: hasCtx,
    run: (q) => contextDev(q, { markdownOptions: { enabled: true, useMainContentOnly: true, maxAgeMs: 0 } }),
  },
];

type Row = Outcome & { variant: string; query: string; ms: number };

async function timed(variant: Variant, query: string): Promise<Row> {
  const started = Date.now();
  try {
    const out = await variant.run(query);
    return { ...out, variant: variant.name, query, ms: Date.now() - started };
  } catch (e) {
    const err = e as Error;
    const status = err.name === "TimeoutError" ? "timeout" : "error";
    return {
      variant: variant.name,
      query,
      ms: Date.now() - started,
      status,
      results: 0,
      contentChars: 0,
      note: err.message.slice(0, 60),
    };
  }
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

const { values } = parseArgs({
  options: { runs: { type: "string", default: "1" }, only: { type: "string" } },
});
const only = values.only?.split(",").map((s) => s.trim());
const variants = VARIANTS.filter((v) => v.ready && (!only || only.includes(v.name)));
const skipped = VARIANTS.filter((v) => !v.ready).map((v) => v.name);
if (skipped.length) console.log(`Skipping (missing keys): ${skipped.join(", ")}`);
if (!variants.length) {
  console.log("Nothing to run.");
  process.exit(1);
}

const rows: Row[] = [];
const runs = Number(values.runs);
for (let run = 0; run < runs; run++) {
  for (const [i, query] of QUERIES.entries()) {
    const order = variants.map((_, k) => variants[(k + i) % variants.length]!);
    for (const v of order) {
      const row = await timed(v, query);
      rows.push(row);
      const note = row.note ? ` [${row.note}]` : "";
      console.log(
        `${String(row.ms).padStart(6)}ms  ${v.name.padEnd(21)} ${row.status.padEnd(7)} ` +
          `${row.results} res, ${String(row.contentChars).padStart(4)} chars  "${query}"${note}`,
      );
    }
  }
}

console.log("\nvariant                 ok/total   p50      p90      max      avg chars");
for (const v of variants) {
  const mine = rows.filter((r) => r.variant === v.name);
  const ok = mine.filter((r) => r.status === "ok");
  const ms = mine.map((r) => r.ms).sort((a, b) => a - b);
  const chars = ok.length ? Math.round(ok.reduce((n, r) => n + r.contentChars, 0) / ok.length) : 0;
  console.log(
    `${v.name.padEnd(23)} ${`${ok.length}/${mine.length}`.padEnd(10)} ` +
      `${`${pct(ms, 50)}ms`.padEnd(8)} ${`${pct(ms, 90)}ms`.padEnd(8)} ${`${ms.at(-1) ?? 0}ms`.padEnd(8)} ${chars}`,
  );
}
