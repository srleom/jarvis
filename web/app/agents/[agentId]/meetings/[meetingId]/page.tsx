import { Suspense } from "react";
import { MeetingView } from "@/components/meeting/meeting-view";
import type { Id } from "@/convex/_generated/dataModel";

type Props = PageProps<"/agents/[agentId]/meetings/[meetingId]">;

export default function MeetingPage({ params }: Props) {
  return (
    <Suspense>
      <MeetingParams params={params} />
    </Suspense>
  );
}

async function MeetingParams({ params }: { params: Props["params"] }) {
  const { agentId, meetingId } = await params;
  return <MeetingView agentId={agentId as Id<"agents">} meetingId={meetingId as Id<"meetings">} />;
}
