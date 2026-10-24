"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarCard } from "@/components/agent/calendar-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/format";
import type { AgentDetail } from "@/lib/types";

export function SettingsTab({ agent }: { agent: AgentDetail }) {
  const router = useRouter();
  const update = useMutation(api.agents.update);
  const remove = useMutation(api.agents.remove);
  const [name, setName] = useState(agent.name);
  const [channel, setChannel] = useState(agent.slackChannelId);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty = name.trim() !== agent.name || channel.trim() !== agent.slackChannelId;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await update({ agentId: agent._id, name, slackChannelId: channel });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setDeleting(true);
    try {
      await remove({ agentId: agent._id });
      toast.success(`Deleted ${agent.name}`);
      router.push("/");
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={save} className="rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold tracking-tight">General</h2>
        <div className="mt-5 grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required />
            <p className="text-xs text-muted-foreground">
              Changing the name changes the wake word to &ldquo;Hey {name.trim() || "…"}&rdquo;.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-channel">Slack channel for meeting notes</Label>
            <Input
              id="s-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="C0123ABCDEF"
              className="font-mono"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={!dirty || busy || !name.trim()}>
            {busy && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
      </form>

      <CalendarCard agentId={agent._id} agentName={agent.name} />

      <div className="rounded-xl border border-destructive/25 bg-card p-5">
        <h2 className="text-base font-semibold tracking-tight">Delete agent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently deletes {agent.name}, its team, documents, every meeting and transcript, and its memory.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4" disabled={!!agent.activeMeeting}>
              Delete {agent.name}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {agent.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes all its meetings, notes, transcripts, documents and memory. It can&rsquo;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={destroy}
                disabled={deleting}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete agent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {agent.activeMeeting && (
          <p className="mt-2 text-xs text-muted-foreground">Remove it from its current call first.</p>
        )}
      </div>
    </div>
  );
}
