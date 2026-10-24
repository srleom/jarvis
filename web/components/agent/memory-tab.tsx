"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { AlertCircle, FileText, Loader2, NotebookText, RotateCw, Search, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, SectionHeader } from "@/components/agent/section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MemoryHit } from "@/convex/memory";
import { errorMessage, formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain";

export function MemoryTab({ agentId, agentName }: { agentId: Id<"agents">; agentName: string }) {
  return (
    <div className="space-y-12">
      <MemorySearch agentId={agentId} agentName={agentName} />
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-8">
        <Documents agentId={agentId} />
        <PastNotes agentId={agentId} />
      </div>
    </div>
  );
}

function MemorySearch({ agentId, agentName }: { agentId: Id<"agents">; agentName: string }) {
  const search = useAction(api.memory.search);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemoryHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setHits(await search({ agentId, query }));
    } catch (err) {
      setError(errorMessage(err, "Search failed."));
      setHits(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionHeader
        title="Search memory"
        description={`Runs the same search ${agentName} uses mid-call, so you can see what it would find.`}
      />
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What's our venue budget?"
            className="h-11 w-full rounded-xl border border-input bg-card pr-3 pl-10 text-[15px] outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <Button type="submit" className="h-11 rounded-xl px-5" disabled={busy || !query.trim()}>
          {busy && <Loader2 className="animate-spin" />}
          Search
        </Button>
      </form>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" /> {error}
        </p>
      )}
      {hits && hits.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Nothing in memory matches that yet.</p>
      )}
      {hits && hits.length > 0 && (
        <ol className="mt-4 grid gap-2">
          {hits.map((h, i) => (
            <li
              key={h.id}
              className="animate-rise rounded-xl border bg-card p-4"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="mb-1.5 flex items-center gap-2 text-xs">
                <SourceChip source={h.source} />
                <span className="truncate text-muted-foreground">{h.label}</span>
                <span className="ml-auto font-mono text-muted-foreground tabular-nums">
                  {(h.score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="line-clamp-4 text-sm leading-relaxed whitespace-pre-line">{h.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SourceChip({ source }: { source: MemoryHit["source"] }) {
  const map = {
    doc: { label: "Document", col: "topics" },
    transcript: { label: "Transcript", col: "actions" },
    notes: { label: "Notes", col: "decisions" },
  } as const;
  const s = map[source] ?? map.doc;
  return (
    <span
      className="rounded-full px-2 py-0.5 font-medium"
      style={{
        background: `var(--col-${s.col})`,
        color: `var(--col-${s.col}-ink)`,
      }}
    >
      {s.label}
    </span>
  );
}

function Documents({ agentId }: { agentId: Id<"agents"> }) {
  const docs = useQuery(api.documents.list, { agentId });
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const save = useMutation(api.documents.save);
  const remove = useMutation(api.documents.remove);
  const retry = useMutation(api.documents.retry);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      if (!/\.(pdf|md|markdown|txt)$/i.test(file.name)) {
        toast.error(`${file.name}: only PDF, Markdown and text files are supported.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type || "text/plain" },
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        await save({
          agentId,
          storageId,
          fileName: file.name,
          contentType: file.type || "text/plain",
          size: file.size,
        });
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e, "upload failed")}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  return (
    <section>
      <SectionHeader title="Context documents" description="Briefs, budgets, sponsor lists. PDF, Markdown or text." />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center rounded-xl border border-dashed bg-card/60 px-4 py-7 text-center transition-colors hover:border-ring hover:bg-card",
          dragging && "border-ring bg-card",
        )}
      >
        {uploading > 0 ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="size-5 text-muted-foreground" />
        )}
        <span className="mt-2 text-sm font-medium">
          {uploading > 0 ? "Uploading…" : "Drop files here or click to upload"}
        </span>
        <span className="text-xs text-muted-foreground">Up to 20 MB each</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mt-3">
        {docs === undefined ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : docs.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {docs.map((d) => (
              <li key={d._id} className="group flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.fileName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBytes(d.size)} · {formatDate(d.uploadedAt)}
                    {d.status === "ready" && <> · {d.mossDocIds.length} chunks</>}
                  </p>
                </div>
                {d.status === "indexing" && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Indexing
                  </span>
                )}
                {d.status === "failed" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => retry({ documentId: d._id })}
                      >
                        <RotateCw /> Retry
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{d.error ?? "Indexing failed"}</TooltipContent>
                  </Tooltip>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${d.fileName}`}
                  className="text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-destructive"
                  onClick={async () => {
                    try {
                      await remove({ documentId: d._id });
                      toast.success(`Deleted ${d.fileName}`);
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function PastNotes({ agentId }: { agentId: Id<"agents"> }) {
  const notes = useQuery(api.memory.pastNotes, { agentId });
  return (
    <section>
      <SectionHeader
        title="Past meeting notes"
        description="Notes from earlier calls are added to memory automatically."
      />
      {notes === undefined ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : notes.length === 0 ? (
        <EmptyState icon={<NotebookText />} title="No notes yet">
          After a call ends, its notes land here and in Slack.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {notes.map((n) => (
            <li key={n._id}>
              <Link
                href={`/agents/${agentId}/meetings/${n.meetingId}`}
                className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(n.startedAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.preview}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
