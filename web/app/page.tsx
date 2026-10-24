"use client";

import { useQuery } from "convex/react";
import { ArrowUpRight, Bot, CalendarDays, Users } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { NewAgentDialog } from "@/components/agents/new-agent-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

export default function AgentsPage() {
  const agents = useQuery(api.agents.list);

  return (
    <div className="min-h-dvh bg-paper">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[44px] leading-none tracking-tight">Agents</h1>
            <p className="mt-3 max-w-md text-muted-foreground">
              AI teammates that join your Google Meet calls, keep a live whiteboard and bring absent teammates in from
              Slack.
            </p>
          </div>
          {agents && agents.length > 0 && <NewAgentDialog />}
        </div>

        <div className="mt-10">
          {agents === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="animate-rise flex flex-col items-center rounded-2xl border border-dashed bg-card/60 px-6 py-20 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-muted">
                <Bot className="size-5 text-muted-foreground" />
              </div>
              <h2 className="mt-5 text-lg font-medium">Create your first agent</h2>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                Give it a name and a Slack channel. Then add your team, upload a brief, and send it into a call.
              </p>
              <div className="mt-6">
                <NewAgentDialog />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent, i) => {
                const status = agent.activeMeeting
                  ? agent.activeMeeting.status === "live"
                    ? "live"
                    : "joining"
                  : "idle";
                return (
                  <Link
                    key={agent._id}
                    href={`/agents/${agent._id}`}
                    className="group animate-rise relative flex flex-col rounded-2xl border bg-card p-5 shadow-[0_1px_2px_oklch(0.2_0.01_60/0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_oklch(0.2_0.01_60/0.25)]"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid size-10 place-items-center rounded-full bg-primary font-serif text-xl text-primary-foreground">
                        {agent.name[0]?.toUpperCase()}
                      </span>
                      <ArrowUpRight className="size-4 text-muted-foreground/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold tracking-tight">{agent.name}</h3>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {agent.description || <>Answers to &ldquo;Hey {agent.name}&rdquo;</>}
                    </p>
                    <div className="mt-6 flex items-center justify-between border-t pt-4">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="size-3.5" />
                          {agent.memberCount} {agent.memberCount === 1 ? "member" : "members"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />
                          {agent.meetingCount} {agent.meetingCount === 1 ? "meeting" : "meetings"}
                        </span>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                  </Link>
                );
              })}
              <NewAgentDialog
                trigger={
                  <Button
                    variant="ghost"
                    className="h-auto min-h-44 flex-col gap-2 rounded-2xl border border-dashed border-border text-muted-foreground hover:bg-card hover:text-foreground"
                  >
                    <span className="grid size-10 place-items-center rounded-full border border-dashed">+</span>
                    New agent
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
