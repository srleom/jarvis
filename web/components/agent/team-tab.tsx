"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Loader2, PenLine, Plus, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, SectionHeader } from "@/components/agent/section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage, initials } from "@/lib/format";

type SlackUser = { id: string; name: string; handle: string; avatarUrl?: string };

export function TeamTab({ agentId, agentName }: { agentId: Id<"agents">; agentName: string }) {
  const members = useQuery(api.team.list, { agentId });
  const remove = useMutation(api.team.remove);
  const [manualOpen, setManualOpen] = useState(false);

  const existing = new Set(members?.map((m) => m.slackUserId));

  return (
    <div className="max-w-3xl">
      <SectionHeader
        title="Team"
        description={`Only these people can DM ${agentName} on Slack for a catch-up, a question or a message to the call.`}
        action={
          <AddMemberButton
            agentId={agentId}
            existing={existing}
            onManual={() => setManualOpen(true)}
          />
        }
      />

      {members === undefined ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : members.length === 0 ? (
        <EmptyState icon={<Users />} title="No team members yet">
          Add the people who&rsquo;ll be in calls with {agentName}, plus anyone who might be late.
        </EmptyState>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {members.map((m) => (
            <li key={m._id} className="group flex items-center gap-3 px-4 py-3">
              <Avatar className="size-9">
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt="" />}
                <AvatarFallback className="bg-muted text-xs font-medium">{initials(m.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{m.slackUserId}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${m.name}`}
                    className="text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-destructive"
                    onClick={async () => {
                      try {
                        await remove({ memberId: m._id });
                        toast.success(`Removed ${m.name}`);
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                  >
                    <UserMinus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}

      <ManualMemberDialog agentId={agentId} open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}

function AddMemberButton({
  agentId,
  existing,
  onManual,
}: {
  agentId: Id<"agents">;
  existing: Set<string>;
  onManual: () => void;
}) {
  const listSlackUsers = useAction(api.team.listSlackUsers);
  const add = useMutation(api.team.add);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<SlackUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listSlackUsers({}));
    } catch (e) {
      setError(errorMessage(e, "Couldn't load Slack users."));
    } finally {
      setLoading(false);
    }
  }

  async function pick(u: SlackUser) {
    setAdding(u.id);
    try {
      await add({ agentId, name: u.name, slackUserId: u.id, avatarUrl: u.avatarUrl });
      toast.success(`Added ${u.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !users) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button>
          <Plus /> Add member
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {error ? (
          <div className="p-4">
            <p className="text-sm font-medium">Slack users unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={load}>
                Try again
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onManual();
                }}
              >
                <PenLine /> Add manually
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Search your Slack workspace…" />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading people…
                </div>
              ) : (
                <>
                  <CommandEmpty>No one found.</CommandEmpty>
                  <CommandGroup>
                    {users?.map((u) => {
                      const already = existing.has(u.id);
                      return (
                        <CommandItem
                          key={u.id}
                          value={`${u.name} ${u.handle}`}
                          disabled={already || adding !== null}
                          onSelect={() => pick(u)}
                          className="gap-2.5"
                        >
                          <Avatar className="size-6">
                            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                            <AvatarFallback className="text-[10px]">{initials(u.name)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate">
                            {u.name}
                            <span className="ml-1.5 text-muted-foreground">@{u.handle}</span>
                          </span>
                          {already && <Check className="text-muted-foreground" />}
                          {adding === u.id && <Loader2 className="animate-spin" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManual();
              }}
              className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PenLine className="size-4" /> Add by Slack user ID
            </button>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ManualMemberDialog({
  agentId,
  open,
  onOpenChange,
}: {
  agentId: Id<"agents">;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const add = useMutation(api.team.add);
  const [name, setName] = useState("");
  const [slackUserId, setSlackUserId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await add({ agentId, name, slackUserId });
      toast.success(`Added ${name.trim()}`);
      setName("");
      setSlackUserId("");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>
              Find someone&rsquo;s member ID in Slack: open their profile, click ⋯, then &ldquo;Copy member ID&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="m-name">Name</Label>
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="m-id">Slack member ID</Label>
            <Input
              id="m-id"
              value={slackUserId}
              onChange={(e) => setSlackUserId(e.target.value)}
              placeholder="U0123ABCDEF"
              className="font-mono"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !slackUserId.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
