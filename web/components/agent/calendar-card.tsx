"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { CalendarCheck, Loader2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/format";

type RecallCalendar = { id: string; platform: string; platformEmail: string | null; status: string };

/** Links a calendar connected in Recall to this agent so its future Google Meet events are joined automatically. */
export function CalendarCard({ agentId, agentName }: { agentId: Id<"agents">; agentName: string }) {
  const links = useQuery(api.calendars.forAgent, { agentId });
  const listCalendars = useAction(api.calendars.available);
  const link = useMutation(api.calendars.link);
  const unlink = useMutation(api.calendars.unlink);
  const [calendars, setCalendars] = useState<RecallCalendar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listCalendars({})
      .then((r) => setCalendars(r.calendars))
      .catch((e) => setError(errorMessage(e)));
  }, [listCalendars]);

  const linkedIds = new Set(links?.map((l) => l.recallCalendarId));
  const candidates = (calendars ?? []).filter((c) => c.status === "connected" && !linkedIds.has(c.id));

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold tracking-tight">Calendar</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {agentName} joins every future Google Meet event on a linked calendar. Add{" "}
        <code className="font-mono text-xs">[nojarvis]</code> to an event&rsquo;s title or description to skip it.
      </p>

      <ul className="mt-4 divide-y rounded-lg border">
        {links?.map((l) => (
          <li key={l._id} className="flex items-center gap-3 px-3 py-2.5">
            <CalendarCheck className="size-4 text-live" />
            <span className="min-w-0 flex-1 truncate text-sm">{l.platformEmail ?? l.recallCalendarId}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === l._id}
              onClick={() => run(l._id, () => unlink({ linkId: l._id }), "Calendar unlinked")}
            >
              <Unlink /> Unlink
            </Button>
          </li>
        ))}
        {links?.length === 0 && <li className="px-3 py-2.5 text-sm text-muted-foreground">No calendar linked.</li>}
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm">{c.platformEmail ?? c.id}</span>
            <Button
              size="sm"
              disabled={busy === c.id}
              onClick={() =>
                run(c.id, () => link({ agentId, recallCalendarId: c.id, platformEmail: c.platformEmail ?? undefined }), "Calendar linked")
              }
            >
              {busy === c.id && <Loader2 className="animate-spin" />}
              Link
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-destructive">Couldn&rsquo;t load calendars from Recall: {error}</p>}
      {!error && calendars?.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No calendar is connected in Recall yet. Connect a Google Calendar there first (see the README).
        </p>
      )}
    </div>
  );
}
