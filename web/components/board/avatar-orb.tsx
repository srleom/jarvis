"use client";

import { Hand } from "lucide-react";
import { cn } from "@/lib/utils";

export type AvatarState = "listening" | "thinking" | "hand_raised" | "speaking";

const LABEL: Record<AvatarState, string> = {
  listening: "Listening",
  thinking: "Thinking",
  hand_raised: "Hand raised",
  speaking: "Speaking",
};

/** Drawn orb avatar. `level` (0..1) drives the speaking ring from the playing audio. */
export function AvatarOrb({
  state,
  name,
  level = 0,
  size = 112,
  row = false,
}: {
  state: AvatarState;
  name: string;
  level?: number;
  size?: number;
  row?: boolean;
}) {
  const ring = state === "speaking" ? 1 + Math.min(level, 1) * 0.35 : 1;
  return (
    <div className={cn("flex items-center", row ? "flex-row-reverse gap-4" : "flex-col gap-2.5")}>
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <span
          className={cn(
            "absolute inset-0 rounded-full transition-transform duration-75",
            state === "listening" && "animate-[orb-breathe_3.2s_ease-in-out_infinite]",
          )}
          style={{
            transform: `scale(${ring})`,
            background:
              state === "hand_raised"
                ? "radial-gradient(circle, color-mix(in oklch, var(--signal) 35%, transparent) 0%, transparent 70%)"
                : "radial-gradient(circle, color-mix(in oklch, var(--signal) 22%, transparent) 0%, transparent 70%)",
          }}
        />
        <span
          className="relative grid place-items-center rounded-full bg-primary shadow-[0_10px_30px_oklch(0.2_0.01_60/0.35)]"
          style={{ width: size * 0.68, height: size * 0.68 }}
        >
          {state === "thinking" ? (
            <span className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-2.5 rounded-full bg-signal animate-[orb-dot_1s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          ) : state === "hand_raised" ? (
            <Hand className="size-9 text-signal animate-[orb-wave_1.4s_ease-in-out_infinite]" />
          ) : (
            <span
              className="rounded-full bg-signal shadow-[0_0_18px_var(--signal)] transition-transform duration-75"
              style={{
                width: size * 0.2,
                height: size * 0.2,
                transform: state === "speaking" ? `scale(${1 + Math.min(level, 1) * 0.8})` : undefined,
              }}
            />
          )}
        </span>
      </div>
      <div className={cn("leading-tight", row ? "text-right" : "text-center")}>
        <div className="text-[17px] font-semibold">{name}</div>
        <div className="text-[14px] text-muted-foreground">{LABEL[state]}</div>
      </div>
    </div>
  );
}
