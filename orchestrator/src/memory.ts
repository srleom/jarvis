import { MossClient } from "@moss-dev/moss";
import { PDFParse } from "pdf-parse";
import { config } from "./config.js";
import { logger } from "./log.js";

const log = logger("moss");

export type MemoryDoc = {
  id: string;
  text: string;
  metadata: Record<string, string>;
};
export type MemoryHit = {
  id: string;
  text: string;
  score: number;
  source: "doc" | "transcript" | "notes" | "state";
  label: string;
  meetingId?: string;
};

let client: MossClient | null = null;
function moss() {
  if (!config.moss.projectId || !config.moss.projectKey) {
    throw new Error("Moss isn't configured (MOSS_PROJECT_ID / MOSS_PROJECT_KEY).");
  }
  client ??= new MossClient(config.moss.projectId, config.moss.projectKey);
  return client;
}

const knownIndexes = new Set<string>();

async function indexExists(indexName: string) {
  if (knownIndexes.has(indexName)) return true;
  const client = moss(); // throws a readable error if Moss isn't configured
  try {
    await client.getIndex(indexName);
    knownIndexes.add(indexName);
    return true;
  } catch {
    return false;
  }
}

/** Adds (upserts) documents, creating the agent's index on first use. One Moss index per agent. */
export async function addDocs(indexName: string, docs: MemoryDoc[]) {
  if (docs.length === 0) return;
  if (await indexExists(indexName)) {
    await moss().addDocs(indexName, docs, { upsert: true });
  } else {
    await moss().createIndex(indexName, docs);
    knownIndexes.add(indexName);
  }
  log.info(`added ${docs.length} doc(s) to ${indexName}`);
}

export async function deleteDocs(indexName: string, docIds: string[]) {
  if (docIds.length === 0 || !(await indexExists(indexName))) return;
  await moss().deleteDocs(indexName, docIds);
  log.info(`deleted ${docIds.length} doc(s) from ${indexName}`);
}

export async function deleteIndex(indexName: string) {
  if (!(await indexExists(indexName))) return;
  await moss().deleteIndex(indexName);
  knownIndexes.delete(indexName);
  log.info(`deleted index ${indexName}`);
}

/** Project state is the newest word, so it outranks documents and notes that score about the same. */
const STATE_BOOST = 0.15;

export async function search(indexName: string, query: string, topK = 5): Promise<MemoryHit[]> {
  if (!(await indexExists(indexName))) return [];
  const started = Date.now();
  // Ask for extra hits so a boosted state fact can move up into the top results.
  const result = await moss().query(indexName, query, { topK: topK + 5 });
  log.info(`query "${query.slice(0, 60)}" → ${result.docs.length} hits in ${Date.now() - started}ms`);
  return result.docs
    .map((d) => {
      const m = d.metadata ?? {};
      const source = (m.source as MemoryHit["source"]) ?? "doc";
      const label =
        source === "doc"
          ? `${m.fileName ?? "Document"}${m.date ? ` (uploaded ${m.date})` : ""}`
          : source === "state"
            ? `Project state${m.date ? ` (updated ${m.date})` : ""}`
            : source === "notes"
              ? `Notes: ${m.title ?? "meeting"}${m.date ? ` (${m.date})` : ""}`
              : `Transcript${m.speakers ? `: ${m.speakers}` : ""}${m.time ? ` · ${m.time}` : ""}`;
      return {
        hit: {
          id: d.id,
          text: d.text,
          score: d.score,
          source,
          label,
          meetingId: m.meetingId,
        },
        rank: d.score + (source === "state" ? STATE_BOOST : 0),
      };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, topK)
    .map((r) => r.hit);
}

/** Splits text into chunks of about `size` words. */
export function chunkWords(text: string, size: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(" "));
  return chunks;
}

/** Downloads an uploaded document, extracts its text and adds ~500-word chunks to memory. */
export async function indexDocument(opts: {
  indexName: string;
  documentId: string;
  fileName: string;
  contentType: string;
  url: string;
  uploadedAt: number;
}) {
  const res = await fetch(opts.url);
  if (!res.ok) throw new Error(`Couldn't download the file (${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());

  let text: string;
  if (/\.pdf$/i.test(opts.fileName) || opts.contentType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else {
    text = buffer.toString("utf8");
  }
  text = text.replaceAll("\0", "").trim();
  if (!text) throw new Error("No text found in this file. Scanned PDFs aren't supported.");

  const chunks = chunkWords(text, 500);
  const docs = chunks.map((chunk, i) => ({
    id: `doc:${opts.documentId}:${i}`,
    text: chunk,
    metadata: {
      source: "doc",
      fileName: opts.fileName,
      documentId: opts.documentId,
      date: new Date(opts.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    },
  }));
  await addDocs(opts.indexName, docs);
  return docs.map((d) => d.id);
}
