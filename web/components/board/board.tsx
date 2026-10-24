"use client";

import { CircleHelp, Gavel, Link2, ListChecks, MessagesSquare, Sparkles } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { domainOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const COLUMNS = [
  { key: "topics", label: "Topics", icon: MessagesSquare },
  { key: "decisions", label: "Decisions", icon: Gavel },
  { key: "questions", label: "Open questions", icon: CircleHelp },
  { key: "actions", label: "Action items", icon: ListChecks },
  { key: "answers", label: "Answers", icon: Sparkles },
] as const;

type Note = Pick<Doc<"boardNotes">, "_id" | "column" | "text" | "owner" | "sourceUrl" | "createdAt">;

/**
 * The five-column whiteboard. "stage" is the 1280x720 screenshare layout (large type,
 * newest notes kept in view); "compact" is the dashboard version.
 */
export function Board({
  notes,
  variant = "compact",
  className,
}: {
  notes: Note[];
  variant?: "stage" | "compact";
  className?: string;
}) {
  const stage = variant === "stage";
  const maxVisible = stage ? 5 : Infinity;
  return (
    <div className={cn("grid grid-cols-5", stage ? "gap-3" : "gap-2.5 min-w-[880px]", className)}>
      {COLUMNS.map((col) => {
        const all = notes
          .filter((n) => n.column === col.key)
          .sort((a, b) => a.createdAt - b.createdAt);
        const hidden = Math.max(0, all.length - maxVisible);
        const visible = hidden ? all.slice(hidden) : all;
        const Icon = col.icon;
        return (
          <section
            key={col.key}
            className={cn(
              "flex min-h-0 flex-col rounded-xl",
              stage ? "p-3" : "p-2.5",
            )}
            style={{ background: `color-mix(in oklch, var(--col-${col.key}) 55%, transparent)` }}
          >
            <header
              className={cn(
                "flex items-center gap-1.5 font-semibold tracking-tight",
                stage ? "mb-3 px-1 text-[19px]" : "mb-2 px-0.5 text-[13px]",
              )}
              style={{ color: `var(--col-${col.key}-ink)` }}
            >
              <Icon className={stage ? "size-5" : "size-3.5"} />
              {col.label}
              <span className={cn("ml-auto tabular-nums opacity-60", stage ? "text-base" : "text-xs")}>
                {all.length || ""}
              </span>
            </header>
            {hidden > 0 && (
              <p className={cn("px-1 pb-2 text-muted-foreground", stage ? "text-[15px]" : "text-xs")}>
                +{hidden} earlier
              </p>
            )}
            <ol className={cn("flex min-h-0 flex-col", stage ? "gap-2.5" : "gap-2")}>
              {visible.map((note) => (
                <NoteCard key={note._id} note={note} stage={stage} />
              ))}
              {all.length === 0 && (
                <li
                  className={cn(
                    "rounded-lg border border-dashed border-current/15 text-center text-muted-foreground/70",
                    stage ? "px-3 py-5 text-[16px]" : "px-2 py-4 text-xs",
                  )}
                >
                  Nothing yet
                </li>
              )}
            </ol>
          </section>
        );
      })}
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
      <p className={cn("leading-snug text-pretty", stage ? "text-[21px] font-medium" : "text-[13px]")}>
        {note.text}
      </p>
      {(note.owner || domain) && (
        <div className={cn("flex flex-wrap items-center gap-1.5", stage ? "mt-2" : "mt-1.5")}>
          {note.owner && (
            <span
              className={cn(
                "inline-flex items-center rounded-full font-medium",
                stage ? "px-2.5 py-0.5 text-[16px]" : "px-1.5 py-px text-[11px]",
              )}
              style={{ background: "var(--col-actions)", color: "var(--col-actions-ink)" }}
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
