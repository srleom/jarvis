"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, ClipboardCheck, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, SectionHeader } from "@/components/agent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { errorMessage, formatDate } from "@/lib/format";

type Proposal = Doc<"stateProposals">;

export function ProjectState({ agentId, agentName }: { agentId: Id<"agents">; agentName: string }) {
  const facts = useQuery(api.state.list, { agentId });
  const pending = useQuery(api.state.pending, { agentId });
  const addFact = useMutation(api.state.addFact);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setAdding(true);
    try {
      await addFact({ agentId, text: draft });
      setDraft("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  const groups = new Map<string, { title: string; startedAt: number; items: NonNullable<typeof pending> }>();
  for (const p of pending ?? []) {
    const g = groups.get(p.meetingId) ?? { title: p.meeting.title, startedAt: p.meeting.startedAt, items: [] };
    g.items.push(p);
    groups.set(p.meetingId, g);
  }

  return (
    <section>
      <SectionHeader
        title="Project state"
        description={`What the team has agreed so far. ${agentName} treats this as newer than your documents.`}
      />

      {groups.size > 0 && (
        <div className="mb-6 grid gap-4">
          {[...groups.entries()].map(([meetingId, g]) => (
            <div key={meetingId} className="rounded-xl border border-ring/40 bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {g.items.length} proposed {g.items.length === 1 ? "change" : "changes"} from{" "}
                  <Link
                    href={`/agents/${agentId}/meetings/${meetingId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {g.title}
                  </Link>
                  <span className="ml-1.5 font-normal text-muted-foreground">{formatDate(g.startedAt)}</span>
                </p>
                <AcceptAll meetingId={meetingId as Id<"meetings">} />
              </div>
              <ProposalList proposals={g.items} />
            </div>
          ))}
        </div>
      )}

      {facts === undefined ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : facts.length === 0 ? (
        <EmptyState icon={<ClipboardCheck />} title="Nothing agreed yet">
          After each call, {agentName} proposes what changed here for you to review. You can also add facts yourself.
        </EmptyState>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {facts.map((f) => (
            <FactRow key={f._id} fact={f} />
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a fact, e.g. Venue budget is $40k"
          maxLength={400}
          aria-label="New project fact"
        />
        <Button type="submit" variant="outline" disabled={adding || !draft.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </section>
  );
}

function AcceptAll({ meetingId }: { meetingId: Id<"meetings"> }) {
  const acceptAll = useMutation(api.state.acceptAll);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await acceptAll({ meetingId });
        } catch (e) {
          toast.error(errorMessage(e));
        }
      }}
    >
      <Check /> Accept all
    </Button>
  );
}

function FactRow({
  fact,
}: {
  fact: Doc<"stateFacts"> & { sourceMeeting: { _id: Id<"meetings">; title: string } | null };
}) {
  const edit = useMutation(api.state.editFact);
  const remove = useMutation(api.state.removeFact);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await edit({ factId: fact._id, text });
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <li className="group flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={save} className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={400} autoFocus />
            <Button type="submit" size="sm" disabled={!text.trim()}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(fact.text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <p className="text-sm">{fact.text}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          Updated {formatDate(fact.updatedAt)}
          {fact.sourceMeeting ? (
            <>
              {" · from "}
              <Link
                href={`/agents/${fact.agentId}/meetings/${fact.sourceMeeting._id}`}
                className="underline-offset-2 hover:underline"
              >
                {fact.sourceMeeting.title}
              </Link>
            </>
          ) : (
            " · added by hand"
          )}
        </p>
      </div>
      {!editing && (
        <div className="flex opacity-60 group-hover:opacity-100">
          <Button variant="ghost" size="icon-sm" aria-label="Edit fact" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete fact"
            className="hover:text-destructive"
            onClick={async () => {
              try {
                await remove({ factId: fact._id });
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

/** Pending proposals as a diff, each with accept, edit-then-accept and dismiss. */
export function ProposalList({ proposals }: { proposals: Proposal[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-background/60">
      {proposals.map((p) => (
        <ProposalRow key={p._id} proposal={p} />
      ))}
    </ul>
  );
}

const KIND_LABEL = { add: "New", update: "Change", remove: "Remove" } as const;

function ProposalRow({ proposal }: { proposal: Proposal }) {
  const accept = useMutation(api.state.accept);
  const dismiss = useMutation(api.state.dismiss);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(proposal.text);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 w-14 shrink-0 text-xs font-medium text-muted-foreground uppercase">
        {KIND_LABEL[proposal.kind]}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {editing ? (
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={400} autoFocus />
        ) : proposal.kind === "remove" ? (
          <>
            <p className="line-through decoration-muted-foreground/60">{proposal.previousText}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{proposal.text}</p>
          </>
        ) : (
          <>
            {proposal.kind === "update" && proposal.previousText && (
              <p className="text-muted-foreground line-through decoration-muted-foreground/60">
                {proposal.previousText}
              </p>
            )}
            <p>{proposal.text}</p>
          </>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="sm"
          onClick={() => run(() => accept({ proposalId: proposal._id, text: editing ? text : undefined }))}
          disabled={editing && !text.trim()}
        >
          <Check /> Accept
        </Button>
        {proposal.kind !== "remove" && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={editing ? "Stop editing" : "Edit before accepting"}
            onClick={() => {
              setText(proposal.text);
              setEditing(!editing);
            }}
          >
            <Pencil />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Dismiss"
          onClick={() => run(() => dismiss({ proposalId: proposal._id }))}
        >
          <X />
        </Button>
      </div>
    </li>
  );
}

/** Shown under a meeting's notes: what the call changed in the project state. */
export function MeetingStateUpdates({ meetingId }: { meetingId: Id<"meetings"> }) {
  const proposals = useQuery(api.state.forMeeting, { meetingId });
  const acceptAll = useMutation(api.state.acceptAll);
  if (!proposals || proposals.length === 0) return null;
  const pending = proposals.filter((p) => p.status === "pending");
  const accepted = proposals.filter((p) => p.status === "accepted").length;
  const dismissed = proposals.filter((p) => p.status === "dismissed").length;

  return (
    <section className="mt-6 max-w-3xl rounded-2xl border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Proposed updates to project state</h2>
          <p className="text-sm text-muted-foreground">
            {pending.length > 0
              ? "Accept what is still true after this call. Nothing changes until you do."
              : `Reviewed: ${accepted} accepted, ${dismissed} dismissed.`}
          </p>
        </div>
        {pending.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await acceptAll({ meetingId });
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <Check /> Accept all
          </Button>
        )}
      </div>
      {pending.length > 0 && <ProposalList proposals={pending} />}
    </section>
  );
}
