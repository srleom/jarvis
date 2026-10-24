"use client";

import {
  Check,
  CircleHelp,
  Gavel,
  Link2,
  ListChecks,
  MessagesSquare,
  Pencil,
  Sparkles,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/convex/_generated/dataModel";
import { domainOf } from "@/lib/format";
import { cn } from "@/lib/utils";

type Note = Pick<Doc<"boardNotes">, "_id" | "column" | "text" | "owner" | "sourceUrl" | "createdAt" | "topicId">;
type Topic = Pick<Doc<"boardTopics">, "_id" | "title" | "status" | "outcome" | "createdAt">;

/** "topics" only exists on boards made before topic cards. */
const SLOTS: { key: Note["column"]; label: string; icon: LucideIcon }[] = [
  { key: "decisions", label: "Decided", icon: Gavel },
  { key: "questions", label: "Open", icon: CircleHelp },
  { key: "actions", label: "To do", icon: ListChecks },
];
const LEGACY_SLOT = { key: "topics", label: "Discussed", icon: MessagesSquare } as const;

const STAGE_MAX_PER_SLOT = 4;
const STAGE_MAX_DONE = 3;

/** A group of notes under one topic. `topic` is null for notes that belong to no topic. */
type Group = { topic: Topic | null; notes: Note[] };

function buildGroups(topics: Topic[], notes: Note[]) {
  const byTime = (a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt;
  const sortedNotes = [...notes].sort(byTime);
  const known = new Set(topics.map((t) => t._id));
  const groups: Group[] = [...topics].sort(byTime).map((topic) => ({
    topic,
    notes: sortedNotes.filter((n) => n.topicId === topic._id),
  }));
  const loose = sortedNotes.filter((n) => !n.topicId || !known.has(n.topicId));
  return { groups, loose };
}

/**
 * The meeting board: a goal bar, then the agenda as topic cards. The topic being discussed is
 * open, finished topics collapse to their outcome, upcoming ones wait as chips.
 * "stage" is the 1280x720 screenshare layout; "compact" is the dashboard version.
 */
export function Board({
  topics,
  notes,
  goal,
  variant = "compact",
  className,
  onSaveGoal,
}: {
  topics: Topic[];
  notes: Note[];
  goal?: string | null;
  variant?: "stage" | "compact";
  className?: string;
  /** When given, the goal can be edited in place. */
  onSaveGoal?: (goal: string) => Promise<void>;
}) {
  const stage = variant === "stage";
  const { groups, loose } = buildGroups(topics, notes);
  const active = groups.filter((g) => g.topic?.status === "active").at(-1);
  const done = groups.filter((g) => g.topic?.status === "done");
  const upcoming = groups.filter((g) => g.topic?.status === "upcoming");
  const dropped = groups.filter((g) => g.topic?.status === "dropped");
  const total = done.length + upcoming.length + (active ? 1 : 0);
  const empty = groups.length === 0 && loose.length === 0;

  if (stage) {
    const hiddenDone = Math.max(0, done.length - STAGE_MAX_DONE);
    const current = active ?? (loose.length ? { topic: null, notes: loose } : undefined);
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {goal && <GoalBar goal={goal} progress={total ? { done: done.length, total } : undefined} stage />}
        {hiddenDone > 0 && <p className="px-1 text-[15px] text-muted-foreground">+{hiddenDone} earlier topics</p>}
        {done.slice(hiddenDone).map((g) => (
          <DoneRow key={g.topic!._id} group={g} stage />
        ))}
        {current ? (
          <TopicCard group={current} stage current className="min-h-0 flex-1" />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center rounded-2xl border border-dashed border-current/15 text-[22px] text-muted-foreground">
            {empty ? "Listening. Topics appear as the team talks." : "Waiting for the next topic"}
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="shrink-0 text-[16px] text-muted-foreground">Up next</span>
            {upcoming.map((g) => (
              <span
                key={g.topic!._id}
                className="truncate rounded-full border bg-card px-3.5 py-1 text-[18px] text-muted-foreground"
              >
                {g.topic!.title}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <GoalBar goal={goal ?? ""} progress={total ? { done: done.length, total } : undefined} onSave={onSaveGoal} />
      {empty && <p className="px-1 py-6 text-center text-sm text-muted-foreground">No topics yet.</p>}
      {[...done, ...(active ? [active] : [])].map((g) => (
        <TopicCard key={g.topic!._id} group={g} current={g === active} />
      ))}
      {loose.length > 0 && <TopicCard group={{ topic: null, notes: loose }} />}
      {upcoming.map((g) => (
        <TopicCard key={g.topic!._id} group={g} />
      ))}
      {dropped.map((g) => (
        <TopicCard key={g.topic!._id} group={g} />
      ))}
    </div>
  );
}

function GoalBar({
  goal,
  progress,
  stage,
  onSave,
}: {
  goal: string;
  progress?: { done: number; total: number };
  stage?: boolean;
  onSave?: (goal: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn("flex items-center gap-3 rounded-xl border bg-card", stage ? "gap-4 px-5 py-3.5" : "px-3.5 py-2.5")}
    >
      <Target className={cn("shrink-0 text-muted-foreground", stage ? "size-7" : "size-4")} />
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What is this meeting for?"
            aria-label="Meeting goal"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
          <Button type="submit" size="icon-sm" disabled={saving} aria-label="Save goal">
            <Check />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditing(false)} aria-label="Cancel">
            <X />
          </Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className={cn("text-muted-foreground", stage ? "text-[15px]" : "text-[11px]")}>Goal</p>
            <p className={cn("truncate font-medium", stage ? "text-[24px] leading-tight" : "text-sm")}>
              {goal || <span className="font-normal text-muted-foreground">Not set yet</span>}
            </p>
          </div>
          {progress && (
            <span className={cn("shrink-0 text-muted-foreground tabular-nums", stage ? "text-[18px]" : "text-xs")}>
              {progress.done} of {progress.total} topics done
            </span>
          )}
          {onSave && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit goal"
              onClick={() => {
                setDraft(goal);
                setEditing(true);
              }}
            >
              <Pencil />
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function DoneRow({ group, stage }: { group: Group; stage?: boolean }) {
  const t = group.topic!;
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-2"
      style={{ background: "color-mix(in oklch, var(--col-decisions) 55%, transparent)" }}
    >
      <Check className={cn("shrink-0", stage ? "size-6" : "size-4")} style={{ color: "var(--col-decisions-ink)" }} />
      <span
        className={cn("shrink-0 font-semibold", stage ? "text-[21px]" : "text-sm")}
        style={{ color: "var(--col-decisions-ink)" }}
      >
        {t.title}
      </span>
      {t.outcome && (
        <span
          className={cn("min-w-0 truncate", stage ? "text-[21px]" : "text-sm")}
          style={{ color: "var(--col-decisions-ink)" }}
        >
          {t.outcome}
        </span>
      )}
    </div>
  );
}

function TopicCard({
  group,
  stage = false,
  current = false,
  className,
}: {
  group: Group;
  stage?: boolean;
  current?: boolean;
  className?: string;
}) {
  const { topic, notes } = group;
  const status = topic?.status;
  const upcoming = status === "upcoming";
  const dropped = status === "dropped";
  const answers = notes.filter((n) => n.column === "answers");
  const slots = [...SLOTS, ...(notes.some((n) => n.column === "topics") ? [LEGACY_SLOT] : [])];
  const shown = stage ? slots : slots.filter((s) => notes.some((n) => n.column === s.key));
  const hasNotes = notes.length > 0;

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-card",
        current ? "border-2 border-signal/60" : "border",
        (upcoming || dropped) && "bg-transparent",
        stage ? "p-4" : "p-3.5",
        className,
      )}
    >
      <header className="flex items-center gap-2.5">
        {status === "done" ? (
          <Check className="size-4 shrink-0" style={{ color: "var(--col-decisions-ink)" }} />
        ) : (
          <span
            className={cn(
              "shrink-0 rounded-full",
              stage ? "size-3" : "size-2",
              current ? "bg-signal" : "border-[1.5px] border-muted-foreground/50",
            )}
          />
        )}
        <h3
          className={cn(
            "font-semibold tracking-tight",
            stage ? "text-[26px]" : "text-[15px]",
            (upcoming || dropped) && "font-medium text-muted-foreground",
            dropped && "line-through",
          )}
        >
          {topic?.title ?? "Other notes"}
        </h3>
        {current && (
          <span
            className={cn(
              "rounded-md bg-signal-soft font-medium text-signal",
              stage ? "px-2.5 py-0.5 text-[16px]" : "px-2 py-px text-[11px]",
            )}
          >
            Now
          </span>
        )}
        {upcoming && <span className="text-xs text-muted-foreground">Up next</span>}
        {dropped && <span className="text-xs text-muted-foreground">Dropped from the agenda</span>}
        {topic?.outcome && status !== "active" && (
          <span className={cn("min-w-0 truncate text-muted-foreground", stage ? "text-[20px]" : "text-sm")}>
            {topic.outcome}
          </span>
        )}
      </header>

      {(hasNotes || (stage && current)) && shown.length > 0 && (
        <div
          className={cn("grid min-h-0 flex-1 gap-3", stage ? "mt-3" : "mt-3")}
          style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}
        >
          {shown.map((slot) => (
            <Slot key={slot.key} slot={slot} notes={notes.filter((n) => n.column === slot.key)} stage={stage} />
          ))}
        </div>
      )}
      {answers.length > 0 && (
        <div className={cn("flex flex-col gap-2 border-t pt-3", stage ? "mt-3" : "mt-3")}>
          {(stage ? answers.slice(-1) : answers).map((n) => (
            <AnswerLine key={n._id} note={n} stage={stage} />
          ))}
        </div>
      )}
    </section>
  );
}

function Slot({
  slot,
  notes,
  stage,
}: {
  slot: { key: string; label: string; icon: LucideIcon };
  notes: Note[];
  stage: boolean;
}) {
  const Icon = slot.icon;
  const hidden = stage ? Math.max(0, notes.length - STAGE_MAX_PER_SLOT) : 0;
  const visible = hidden ? notes.slice(hidden) : notes;
  return (
    <div
      className={cn("flex min-h-0 flex-col rounded-xl", stage ? "p-3" : "p-2.5")}
      style={{ background: `color-mix(in oklch, var(--col-${slot.key}) 55%, transparent)` }}
    >
      <p
        className={cn("flex items-center gap-1.5 font-semibold", stage ? "mb-2.5 text-[18px]" : "mb-2 text-xs")}
        style={{ color: `var(--col-${slot.key}-ink)` }}
      >
        <Icon className={stage ? "size-5" : "size-3.5"} />
        {slot.label}
      </p>
      {hidden > 0 && (
        <p className={cn("pb-2 text-muted-foreground", stage ? "text-[15px]" : "text-xs")}>+{hidden} earlier</p>
      )}
      <ol className={cn("flex min-h-0 flex-col", stage ? "gap-2" : "gap-1.5")}>
        {visible.map((note) => (
          <NoteCard key={note._id} note={note} stage={stage} />
        ))}
        {notes.length === 0 && (
          <li className={cn("text-muted-foreground/70", stage ? "px-1 text-[17px]" : "px-1 text-xs")}>Nothing yet</li>
        )}
      </ol>
    </div>
  );
}

function AnswerLine({ note, stage }: { note: Note; stage: boolean }) {
  const domain = domainOf(note.sourceUrl);
  return (
    <div className="flex items-center gap-2.5" style={{ color: "var(--col-answers-ink)" }}>
      <Sparkles className={cn("shrink-0", stage ? "size-5" : "size-3.5")} />
      <p className={cn("min-w-0 flex-1", stage ? "truncate text-[20px] font-medium" : "text-[13px]")}>{note.text}</p>
      {domain &&
        (stage ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[16px] text-muted-foreground">
            <Link2 className="size-4" />
            {domain}
          </span>
        ) : (
          <a
            href={note.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <Link2 className="size-3" />
            {domain}
          </a>
        ))}
    </div>
  );
}

function NoteCard({ note, stage }: { note: Note; stage: boolean }) {
  const domain = domainOf(note.sourceUrl);
  return (
    <li
      className={cn(
        "animate-rise rounded-lg bg-card shadow-[0_1px_0_oklch(0.2_0.01_60/0.06),0_1px_3px_oklch(0.2_0.01_60/0.06)] ring-1 ring-black/[0.04]",
        stage ? "px-3.5 py-3" : "px-2.5 py-2",
      )}
    >
      <p className={cn("leading-snug text-pretty", stage ? "text-[21px] font-medium" : "text-[13px]")}>{note.text}</p>
      {(note.owner || domain) && (
        <div className={cn("flex flex-wrap items-center gap-1.5", stage ? "mt-2" : "mt-1.5")}>
          {note.owner && (
            <span
              className={cn(
                "inline-flex items-center rounded-full font-medium",
                stage ? "px-2.5 py-0.5 text-[16px]" : "px-1.5 py-px text-[11px]",
              )}
              style={{
                background: "var(--col-actions)",
                color: "var(--col-actions-ink)",
              }}
            >
              {note.owner}
            </span>
          )}
          {domain &&
            (stage ? (
              <span className="inline-flex items-center gap-1 text-[16px] text-muted-foreground">
                <Link2 className="size-4" />
                {domain}
              </span>
            ) : (
              <a
                href={note.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Link2 className="size-3" />
                {domain}
              </a>
            ))}
        </div>
      )}
    </li>
  );
}
