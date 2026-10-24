import { ConvexError } from "convex/values";

export function errorMessage(e: unknown, fallback = "Something went wrong.") {
  if (e instanceof ConvexError) {
    return typeof e.data === "string" ? e.data : fallback;
  }
  if (e instanceof Error) {
    // Convex wraps server errors as "[CONVEX ...] Uncaught Error: message"
    const m = e.message.match(/Uncaught (?:Convex)?Error: (.+?)(?:\n|$)/);
    return m?.[1] ?? fallback;
  }
  return fallback;
}

export function formatDuration(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function domainOf(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
