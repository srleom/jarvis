type Level = "info" | "warn" | "error";

function write(level: Level, scope: string, msg: string, extra?: unknown) {
  const time = new Date().toISOString().slice(11, 23);
  const line = `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (extra !== undefined) out(line, extra);
  else out(line);
}

export function logger(scope: string) {
  return {
    info: (msg: string, extra?: unknown) => write("info", scope, msg, extra),
    warn: (msg: string, extra?: unknown) => write("warn", scope, msg, extra),
    error: (msg: string, extra?: unknown) => write("error", scope, msg, extra),
  };
}
