"use client";

import { useMutation } from "convex/react";
import { ArrowRight, Loader2, PhoneOff, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/format";
import type { AgentDetail } from "@/lib/types";

export function SendToMeeting({ agent }: { agent: AgentDetail }) {
  const send = useMutation(api.meetings.send);
  const leave = useMutation(api.meetings.leave);
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = agent.activeMeeting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await send({ agentId: agent._id, meetUrl: url, goal: goal.trim() || undefined });
      setUrl("");
      setGoal("");
      toast.success(`${agent.name} is joining. Admit it from the Meet lobby.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeFromCall() {
    if (!active) return;
    setBusy(true);
    try {
      await leave({ meetingId: active._id });
      toast.success(`${agent.name} is leaving the call.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    const live = active.status === "live";
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3 pl-4 shadow-[0_1px_2px_oklch(0.2_0.01_60/0.04)]">
        <span
          className={`size-2 shrink-0 rounded-full live-dot ${live ? "bg-live text-live" : "bg-signal text-signal"}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{live ? "In a meeting now" : "Joining the call…"}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{active.meetUrl.replace("https://", "")}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={removeFromCall} disabled={busy} className="text-muted-foreground">
          <PhoneOff /> <span className="hidden sm:inline">Remove</span>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/agents/${agent._id}/meetings/${active._id}`}>
            Open <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-3 shadow-[0_1px_2px_oklch(0.2_0.01_60/0.04)]">
      <label htmlFor="meet-url" className="mb-2 block px-1 text-xs font-medium text-muted-foreground">
        Send to a meeting now
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Video className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="meet-url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            placeholder="meet.google.com/abc-defg-hij"
            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive/60 aria-invalid:ring-3 aria-invalid:ring-destructive/15"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" className="h-9 px-4" disabled={busy || !url.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Send
        </Button>
      </div>
      <input
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        maxLength={200}
        aria-label="Meeting goal (optional)"
        placeholder="Goal (optional), like “pick a venue and set the budget”"
        className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        autoComplete="off"
      />
      {error && <p className="mt-2 px-1 text-xs text-destructive">{error}</p>}
    </form>
  );
}
