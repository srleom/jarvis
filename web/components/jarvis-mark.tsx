import { cn } from "@/lib/utils";

/** The Jarvis mark: a small ink orb with a signal-coloured core. */
export function JarvisMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex size-6 items-center justify-center rounded-full bg-primary", className)}
    >
      <span className="size-2 rounded-full bg-signal shadow-[0_0_8px_var(--signal)]" />
    </span>
  );
}
