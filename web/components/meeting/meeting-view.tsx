"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  ExternalLink,
  Loader2,
  MessageSquareQuote,
  MonitorPlay,
  NotebookText,
  PhoneOff,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/agent/section";
import { AppHeader } from "@/components/app-header";
import { Board } from "@/components/board/board";
import { DeleteMeetingDialog } from "@/components/meeting/delete-meeting-dialog";
import { Markdown } from "@/components/meeting/markdown";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { domainOf, errorMessage, formatClock, formatDate, formatDuration, formatTime } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

export function MeetingView({ agentId, meetingId }: { agentId: Id<"agents">; meetingId: Id<"meetings"> }) {
  const data = useQuery(api.meetings.get, { meetingId });
  const board = useQuery(api.meetings.board, { meetingId });
  const answers = useQuery(api.meetings.answers, { meetingId });
  const relays = useQuery(api.meetings.relays, { meetingId });
  const transcript = useQuery(api.meetings.transcript, { meetingId });
  const now = useNow(15_000);

  const [tab, setTab] = useState<string | null>(null);

  if (data === null) {
    return (
      <div className="min-h-dvh bg-paper">
        <AppHeader />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="font-serif text-4xl">Meeting not found</h1>
          <p className="mt-2 text-muted-foreground">It may have been deleted.</p>
          <Button asChild className="mt-6">
            <Link href={`/agents/${agentId}`}>Back to meetings</Link>
          </Button>
        </main>
      </div>
    );
  }

  const meeting = data?.meeting;
  const inProgress = meeting?.status === "live" || meeting?.status === "joining";
  const activeTab = tab ?? (inProgress ? "whiteboard" : "notes");
  const end = meeting ? (meeting.endedAt ?? (inProgress ? now : meeting.startedAt)) : 0;

  return (
    <div className="min-h-dvh bg-paper">
      <AppHeader
        crumbs={[
          { label: data?.agentName ?? "…", href: `/agents/${agentId}` },
          {
            label: meeting?.title ?? (inProgress ? "Live meeting" : "Meeting"),
          },
        ]}
      />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        {!meeting ? (
          <div>
            <Skeleton className="h-10 w-80" />
            <Skeleton className="mt-3 h-4 w-56" />
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-serif text-[38px] leading-tight tracking-tight">
                  {meeting.title ??
                    (inProgress
                      ? "Meeting in progress"
                      : meeting.status === "scheduled"
                        ? "Scheduled meeting"
                        : meeting.status === "cancelled"
                          ? "Cancelled meeting"
                          : meeting.status === "failed"
                            ? "Couldn't join the call"
                            : "Writing notes…")}
                </h1>
                {meeting.status === "live" && <StatusBadge status="live" label="Live" />}
                {meeting.status === "joining" && <StatusBadge status="joining" label="Waiting to be admitted" />}
                {meeting.status === "scheduled" && <StatusBadge status="scheduled" />}
                {meeting.status === "cancelled" && <StatusBadge status="cancelled" />}
                {meeting.status === "failed" && <StatusBadge status="failed" />}
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {formatDate(meeting.startedAt)} · {formatTime(meeting.startedAt)} ·{" "}
                {meeting.status === "scheduled" || meeting.status === "cancelled"
                  ? "from calendar"
                  : formatDuration(end - meeting.startedAt)}
                <span className="mx-1.5">·</span>
                <a
                  href={meeting.meetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs underline-offset-2 hover:text-foreground hover:underline"
                >
                  {meeting.meetUrl.replace("https://", "")}
                </a>
              </p>
              {meeting.status === "failed" && meeting.error && (
                <p className="mt-3 max-w-xl rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
                  {meeting.error}
                </p>
              )}
            </div>
            <MeetingActions meeting={meeting} agentId={agentId} />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setTab} className="mt-8">
          <div className="-mx-4 overflow-x-auto border-b px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <TabsList variant="line" className="h-11 gap-4 p-0">
              <Trigger value="notes" label="Notes" />
              <Trigger value="whiteboard" label="Whiteboard" count={board?.length} />
              <Trigger value="answers" label="Answers" count={answers?.length} />
              <Trigger value="relay" label="Relay log" count={relays?.length} />
              <Trigger value="transcript" label="Transcript" count={transcript?.length} />
            </TabsList>
          </div>

          <div className="pt-8">
            <TabsContent value="notes">
              <NotesPanel notes={data?.notes ?? null} inProgress={inProgress} loading={data === undefined} />
            </TabsContent>
            <TabsContent value="whiteboard">
              {board === undefined ? (
                <Skeleton className="h-80 rounded-2xl" />
              ) : (
                <div className="overflow-x-auto rounded-2xl border bg-card p-3">
                  <Board notes={board} />
                </div>
              )}
              {inProgress && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-live live-dot text-live" />
                  Updates live as the team talks.
                </p>
              )}
            </TabsContent>
            <TabsContent value="answers">
              <AnswersPanel answers={answers} agentName={data?.agentName ?? "Jarvis"} />
            </TabsContent>
            <TabsContent value="relay">
              <RelayPanel relays={relays} />
            </TabsContent>
            <TabsContent value="transcript">
              <TranscriptPanel segments={transcript} live={inProgress} />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}

function Trigger({ value, label, count }: { value: string; label: string; count?: number }) {
  return (
    <TabsTrigger value={value} className="h-full flex-none px-0.5 text-[14px]">
      {label}
      {!!count && (
        <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </TabsTrigger>
  );
}

function MeetingActions({ meeting, agentId }: { meeting: Doc<"meetings">; agentId: Id<"agents"> }) {
  const router = useRouter();
  const leave = useMutation(api.meetings.leave);
  const [busy, setBusy] = useState(false);
  const scheduled = meeting.status === "scheduled";
  const inProgress = meeting.status === "live" || meeting.status === "joining" || scheduled;

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" asChild>
            <a href={`/bot/${meeting._id}`} target="_blank" rel="noreferrer" aria-label="Open screenshare view">
              <MonitorPlay />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open the screenshare view</TooltipContent>
      </Tooltip>
      {inProgress ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await leave({ meetingId: meeting._id });
              toast.success(scheduled ? "Meeting cancelled." : "Leaving the call. Notes will follow.");
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <PhoneOff /> {scheduled ? "Cancel meeting" : "Remove from call"}
        </Button>
      ) : (
        <DeleteMeetingDialog meetingId={meeting._id} onDeleted={() => router.push(`/agents/${agentId}`)}>
          <Button variant="outline" className="text-muted-foreground hover:text-destructive">
            <Trash2 /> Delete
          </Button>
        </DeleteMeetingDialog>
      )}
    </div>
  );
}

function NotesPanel({
  notes,
  inProgress,
  loading,
}: {
  notes: Doc<"meetingNotes"> | null;
  inProgress: boolean;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!notes) {
    return inProgress ? (
      <EmptyState icon={<NotebookText />} title="Notes arrive when the call ends">
        They&rsquo;ll be posted to Slack and saved here. Watch the whiteboard for what&rsquo;s been decided so far.
      </EmptyState>
    ) : (
      <EmptyState icon={<Loader2 className="animate-spin" />} title="Writing notes…">
        This usually takes under a minute.
      </EmptyState>
    );
  }
  return (
    <article className="max-w-3xl rounded-2xl border bg-card px-6 py-7 sm:px-10 sm:py-9">
      <Markdown>{notes.markdown}</Markdown>
      <footer className="mt-8 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
        <Send className="size-3.5" />
        {notes.slackMessageTs ? "Posted to Slack" : "Not posted to Slack"} · {formatTime(notes.createdAt)}
      </footer>
    </article>
  );
}

function AnswersPanel({ answers, agentName }: { answers: Doc<"answers">[] | undefined; agentName: string }) {
  if (answers === undefined) return <Skeleton className="h-40 rounded-2xl" />;
  if (answers.length === 0) {
    return (
      <EmptyState icon={<Sparkles />} title="No questions yet">
        Say &ldquo;Hey {agentName}&rdquo; followed by a question during the call.
      </EmptyState>
    );
  }
  return (
    <ul className="grid max-w-3xl gap-3">
      {answers.map((a) => {
        const domain = domainOf(a.sourceUrl);
        return (
          <li key={a._id} className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground">
              {a.askedBy} asked · {formatTime(a.createdAt)}
            </p>
            <p className="mt-1 font-medium">{a.question}</p>
            <div className="mt-3 flex gap-3 rounded-xl bg-muted/60 p-3.5">
              <Sparkles className="mt-0.5 size-4 shrink-0" style={{ color: "var(--col-answers-ink)" }} />
              <p className="text-[15px] leading-relaxed">{a.spokenAnswer}</p>
            </div>
            {(domain || a.toolLog.length > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {domain && (
                  <a
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    <ExternalLink className="size-3" /> {domain}
                  </a>
                )}
                {a.toolLog.map((t, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px]",
                          t.status === "ok" ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {t.tool} · {(t.ms / 1000).toFixed(1)}s
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm break-all">
                      {t.input} ({t.status})
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const RELAY_LABEL: Record<Doc<"relayRequests">["status"], string> = {
  queued: "Waiting",
  hand_raised: "Hand raised",
  speaking: "Reading out",
  awaiting_answer: "Listening for answer",
  answered: "Answered",
  expired: "No answer",
};

function RelayPanel({ relays }: { relays: Doc<"relayRequests">[] | undefined }) {
  if (relays === undefined) return <Skeleton className="h-40 rounded-2xl" />;
  if (relays.length === 0) {
    return (
      <EmptyState icon={<MessageSquareQuote />} title="No relayed messages">
        When a teammate DMs a message for the team on Slack, it shows up here with the team&rsquo;s reply.
      </EmptyState>
    );
  }
  return (
    <ul className="grid max-w-3xl gap-3">
      {relays.map((r) => (
        <li key={r._id} className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {r.fromName}{" "}
              <span className="font-normal text-muted-foreground">via Slack · {formatTime(r.createdAt)}</span>
            </p>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                r.status === "answered"
                  ? "bg-live-soft text-live"
                  : r.status === "expired"
                    ? "bg-muted text-muted-foreground"
                    : "bg-signal-soft text-signal",
              )}
            >
              {RELAY_LABEL[r.status]}
            </span>
          </div>
          <p className="mt-2 text-[15px] leading-relaxed">&ldquo;{r.message}&rdquo;</p>
          {(r.teamAnswer || r.slackReply) && (
            <div className="mt-4 grid gap-2 border-t pt-4 text-sm">
              {r.teamAnswer && (
                <p>
                  <span className="text-muted-foreground">The team said: </span>
                  {r.teamAnswer}
                </p>
              )}
              {r.slackReply && (
                <p className="flex gap-2">
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="text-muted-foreground">Sent to {r.fromName.split(" ")[0]}: </span>
                    {r.slackReply}
                  </span>
                </p>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const SPEAKER_TINTS = ["topics", "decisions", "questions", "actions", "answers"] as const;

function TranscriptPanel({ segments, live }: { segments: Doc<"transcriptSegments">[] | undefined; live: boolean }) {
  const [filter, setFilter] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const speakers = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of segments ?? []) {
      if (!map.has(s.speaker)) map.set(s.speaker, SPEAKER_TINTS[map.size % SPEAKER_TINTS.length]!);
    }
    return map;
  }, [segments]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return segments ?? [];
    return (segments ?? []).filter((s) => s.text.toLowerCase().includes(q) || s.speaker.toLowerCase().includes(q));
  }, [segments, filter]);

  useEffect(() => {
    if (live && !filter) bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [segments?.length, live, filter]);

  if (segments === undefined) return <Skeleton className="h-64 rounded-2xl" />;
  if (segments.length === 0) {
    return (
      <EmptyState icon={<MessageSquareQuote />} title="No transcript yet">
        {live ? "Everything said in the call will appear here." : "Nothing was transcribed in this meeting."}
      </EmptyState>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search the transcript"
          className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>
      <ol className="overflow-hidden rounded-2xl border bg-card">
        {shown.map((s, i) => {
          const prev = shown[i - 1];
          const continued = prev?.speaker === s.speaker;
          const tint = speakers.get(s.speaker) ?? "topics";
          return (
            <li
              key={s._id}
              className={cn(
                "grid grid-cols-[56px_1fr] gap-3 px-5",
                continued ? "pb-2" : "border-t pt-4 pb-2 first:border-t-0",
              )}
            >
              <span className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                {formatClock(s.startTime)}
              </span>
              <div>
                {!continued && (
                  <p className="mb-0.5 text-sm font-semibold" style={{ color: `var(--col-${tint}-ink)` }}>
                    {s.speaker}
                  </p>
                )}
                <p className="text-[15px] leading-relaxed">{s.text}</p>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No lines match.</li>}
      </ol>
      <div ref={bottom} />
    </div>
  );
}
