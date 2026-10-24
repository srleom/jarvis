"use client";

import { useQuery } from "convex/react";
import { Hand, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { AvatarOrb, type AvatarState } from "@/components/board/avatar-orb";
import { Board } from "@/components/board/board";
import { JarvisMark } from "@/components/jarvis-mark";
import { useVoice } from "@/components/bot/use-voice";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const W = 1280;
const H = 720;

/**
 * What Recall renders as the bot's screenshare: the live whiteboard plus the avatar.
 * Designed for exactly 1280x720; in a normal browser it scales to fit the window.
 */
export function BotStage({ meetingId }: { meetingId: Id<"meetings"> }) {
  const data = useQuery(api.meetings.get, { meetingId });
  const notes = useQuery(api.meetings.board, { meetingId });
  const avatar = useQuery(api.meetings.avatar, { meetingId });
  const { level } = useVoice(meetingId);
  const scale = useFitScale();

  const name = data?.agentName ?? "Jarvis";
  const state: AvatarState = (avatar?.state as AvatarState | undefined) ?? "listening";
  const clock = useClock();

  return (
    <div className="fixed inset-0 grid place-items-center overflow-hidden bg-[oklch(0.93_0.006_80)]">
      <div
        className="relative flex origin-center flex-col bg-paper"
        style={{ width: W, height: H, transform: `scale(${scale})` }}
      >
        <header className="flex h-[60px] shrink-0 items-center gap-3 border-b px-7">
          <JarvisMark className="size-7" />
          <span className="text-[20px] font-semibold tracking-tight">{name}</span>
          <span className="text-[18px] text-muted-foreground">· Live whiteboard</span>
          <span className="ml-auto inline-flex items-center gap-2 text-[17px] text-muted-foreground tabular-nums">
            <span className="size-2 rounded-full bg-live live-dot text-live" />
            {clock}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden px-6 pt-5">
          <Board notes={notes ?? []} variant="stage" className="h-full" />
        </div>

        <footer className="flex h-[132px] shrink-0 items-center gap-6 px-7">
          <div className="min-w-0 flex-1">
            {state === "hand_raised" && avatar?.preview ? (
              <div className="animate-rise flex items-center gap-4 rounded-2xl bg-signal-soft px-5 py-4 ring-1 ring-signal/30">
                <Hand className="size-8 shrink-0 text-signal" />
                <div className="min-w-0">
                  <p className="truncate text-[22px] font-semibold">{avatar.preview}</p>
                  <p className="text-[17px] text-muted-foreground">
                    Say &ldquo;Go ahead, {name}&rdquo; or type <b>go</b> in chat
                  </p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2.5 text-[18px] text-muted-foreground">
                <Mic className="size-5" />
                Say &ldquo;Hey {name}&rdquo; to ask a question
              </p>
            )}
          </div>
          <AvatarOrb state={state} name={name} level={level} size={96} row />
        </footer>
      </div>
    </div>
  );
}

function useFitScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

function useClock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const update = () =>
      setNow(
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
