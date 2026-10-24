import { Suspense } from "react";
import { BotStage } from "@/components/bot/bot-stage";
import type { Id } from "@/convex/_generated/dataModel";

export const metadata = { title: "Whiteboard" };

type Props = PageProps<"/bot/[meetingId]">;

export default function BotPage({ params }: Props) {
  return (
    <Suspense>
      <BotParams params={params} />
    </Suspense>
  );
}

async function BotParams({ params }: { params: Props["params"] }) {
  const { meetingId } = await params;
  return <BotStage meetingId={meetingId as Id<"meetings">} />;
}
