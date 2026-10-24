import { Suspense } from "react";
import { AgentView } from "@/components/agent/agent-view";
import type { Id } from "@/convex/_generated/dataModel";

export default function AgentPage({ params }: PageProps<"/agents/[agentId]">) {
  return (
    <Suspense>
      <AgentParams params={params} />
    </Suspense>
  );
}

async function AgentParams({ params }: { params: PageProps<"/agents/[agentId]">["params"] }) {
  const { agentId } = await params;
  return <AgentView agentId={agentId as Id<"agents">} />;
}
