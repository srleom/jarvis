"use client";

import { useQuery } from "convex/react";
import { CalendarDays, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/agent/section";
import { DeleteMeetingDialog } from "@/components/meeting/delete-meeting-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { useNow } from "@/lib/use-now";

export function MeetingsTab({ agentId }: { agentId: Id<"agents"> }) {
  const meetings = useQuery(api.meetings.listByAgent, { agentId });
  const now = useNow(30_000);

  if (meetings === undefined) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <EmptyState icon={<CalendarDays />} title="No meetings yet">
        Paste a Google Meet link above to send this agent into a call. Notes, the whiteboard and the transcript will
        show up here.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {meetings.map((m) => {
        const inProgress = m.status === "live" || m.status === "joining";
        const end = m.endedAt ?? (inProgress ? now : m.startedAt);
        return (
          <li key={m._id} className="flex items-center transition-colors hover:bg-muted/50">
            <Link
              href={`/agents/${agentId}/meetings/${m._id}`}
              className="group flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-4 sm:pl-5"
            >
              <div className="hidden w-14 shrink-0 flex-col items-center rounded-lg bg-muted/70 py-1.5 sm:flex">
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  {new Date(m.startedAt).toLocaleDateString("en-US", {
                    month: "short",
                  })}
                </span>
                <span className="text-lg leading-none font-semibold tabular-nums">
                  {new Date(m.startedAt).getDate()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.title ??
                    (inProgress
                      ? "Meeting in progress"
                      : m.status === "scheduled"
                        ? "Scheduled meeting"
                        : m.status === "cancelled"
                          ? "Cancelled meeting"
                          : m.status === "failed"
                            ? "Couldn't join"
                            : "Writing notes…")}
                </p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {formatDate(m.startedAt)} · {formatTime(m.startedAt)}
                  {m.status !== "failed" && m.status !== "scheduled" && m.status !== "cancelled" && (
                    <> · {formatDuration(end - m.startedAt)}</>
                  )}
                  {m.source === "calendar" && <> · from calendar</>}
                  {m.status === "failed" && m.error && <> · {m.error}</>}
                </p>
              </div>
              {m.status === "live" && <StatusBadge status="live" label="Live" />}
              {m.status === "joining" && <StatusBadge status="joining" />}
              {m.status === "scheduled" && <StatusBadge status="scheduled" />}
              {m.status === "cancelled" && <StatusBadge status="cancelled" />}
              {m.status === "failed" && <StatusBadge status="failed" />}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <div className="flex w-12 shrink-0 justify-center">
              {(m.status === "ended" || m.status === "failed" || m.status === "cancelled") && (
                <DeleteMeetingDialog meetingId={m._id}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete meeting"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </DeleteMeetingDialog>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
