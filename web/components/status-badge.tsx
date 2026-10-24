import { cn } from "@/lib/utils";

type Status = "live" | "joining" | "idle" | "ended" | "failed";

const styles: Record<Status, { label: string; className: string; dot: string }> = {
  live: {
    label: "In a meeting",
    className: "bg-live-soft text-live",
    dot: "bg-live live-dot",
  },
  joining: {
    label: "Joining",
    className: "bg-signal-soft text-signal",
    dot: "bg-signal live-dot",
  },
  idle: {
    label: "Idle",
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  ended: {
    label: "Ended",
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

export function StatusBadge({ status, label, className }: { status: Status; label?: string; className?: string }) {
  const s = styles[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {label ?? s.label}
    </span>
  );
}
