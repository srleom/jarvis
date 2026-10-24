"use client";

import { useMutation } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/format";

export function NewAgentDialog({ trigger }: { trigger?: ReactNode }) {
  const router = useRouter();
  const create = useMutation(api.agents.create);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Jarvis");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await create({ name, description, slackChannelId: channel });
      setOpen(false);
      router.push(`/agents/${id}?tab=team`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  const wake = name.trim() || "Jarvis";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName("Jarvis");
          setDescription("");
          setChannel("");
          setBusy(false);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New agent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New agent</DialogTitle>
            <DialogDescription>
              An agent joins your calls, keeps the whiteboard and posts notes to Slack.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              This is also the wake word. People say &ldquo;Hey {wake}&rdquo; to ask it something.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agent-description">Description</Label>
            <Textarea
              id="agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Which project this agent is assigned to"
              maxLength={280}
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agent-channel">Slack channel for meeting notes</Label>
            <Input
              id="agent-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="C0123ABCDEF"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              The channel ID (in Slack: channel details → bottom of the About tab). Invite the bot to it.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              Create agent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
