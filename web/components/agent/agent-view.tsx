"use client";

import { useQuery } from "convex/react";
import { BookOpen, CalendarDays, Settings2, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { InstructionsTab } from "@/components/agent/instructions-tab";
import { MeetingsTab } from "@/components/agent/meetings-tab";
import { MemoryTab } from "@/components/agent/memory-tab";
import { SendToMeeting } from "@/components/agent/send-to-meeting";
import { SettingsTab } from "@/components/agent/settings-tab";
import { TeamTab } from "@/components/agent/team-tab";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const TABS = [
  { key: "meetings", label: "Meetings", icon: CalendarDays },
  { key: "team", label: "Team", icon: Users },
  { key: "memory", label: "Memory", icon: BookOpen },
  { key: "instructions", label: "Instructions", icon: SlidersHorizontal },
  { key: "settings", label: "Settings", icon: Settings2 },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function AgentView({ agentId }: { agentId: Id<"agents"> }) {
  const agent = useQuery(api.agents.get, { agentId });
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "meetings";

  function setTab(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "meetings") sp.delete("tab");
    else sp.set("tab", next);
    const qs = sp.toString();
    // Shallow URL update: instant tab switch, no server round trip.
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  if (agent === null) {
    return (
      <div className="min-h-dvh bg-paper">
        <AppHeader />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="font-serif text-4xl">Agent not found</h1>
          <p className="mt-2 text-muted-foreground">It may have been deleted.</p>
          <Button asChild className="mt-6">
            <Link href="/">Back to agents</Link>
          </Button>
        </main>
      </div>
    );
  }

  const status = agent?.activeMeeting
    ? agent.activeMeeting.status === "live"
      ? "live"
      : "joining"
    : "idle";

  return (
    <div className="min-h-dvh bg-paper">
      <AppHeader crumbs={[{ label: agent?.name ?? "…" }]} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,440px)] lg:items-end">
          <div className="flex items-center gap-4">
            {agent ? (
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary font-serif text-3xl text-primary-foreground">
                {agent.name[0]?.toUpperCase()}
              </span>
            ) : (
              <Skeleton className="size-14 rounded-full" />
            )}
            <div className="min-w-0">
              {agent ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="truncate font-serif text-[40px] leading-none tracking-tight">{agent.name}</h1>
                    <StatusBadge status={status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Say &ldquo;Hey {agent.name}&rdquo; in a call to ask it something.
                  </p>
                </>
              ) : (
                <>
                  <Skeleton className="h-9 w-48" />
                  <Skeleton className="mt-2 h-4 w-64" />
                </>
              )}
            </div>
          </div>
          {agent ? <SendToMeeting agent={agent} /> : <Skeleton className="h-[92px] rounded-xl" />}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-10">
          <div className="-mx-4 overflow-x-auto border-b px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <TabsList variant="line" className="h-11 gap-4 p-0">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="h-full flex-none px-0.5 text-[14px]">
                  <t.icon />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {agent && (
            <div className="pt-8">
              <TabsContent value="meetings">
                <MeetingsTab agentId={agentId} />
              </TabsContent>
              <TabsContent value="team">
                <TeamTab agentId={agentId} agentName={agent.name} />
              </TabsContent>
              <TabsContent value="memory">
                <MemoryTab agentId={agentId} agentName={agent.name} />
              </TabsContent>
              <TabsContent value="instructions">
                <InstructionsTab agent={agent} />
              </TabsContent>
              <TabsContent value="settings">
                <SettingsTab agent={agent} />
              </TabsContent>
            </div>
          )}
        </Tabs>
      </main>
    </div>
  );
}
