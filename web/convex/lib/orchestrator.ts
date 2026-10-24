import { env } from "../_generated/server";

/** Calls the orchestrator's internal HTTP API. Throws with a readable message on failure. */
export async function callOrchestrator<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const base = env.ORCHESTRATOR_URL;
  if (!base) {
    throw new Error(
      "ORCHESTRATOR_URL is not set on the Convex deployment. Run `npx convex env set ORCHESTRATOR_URL ...`.",
    );
  }
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jarvis-secret": env.ORCHESTRATOR_SECRET ?? "",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the orchestrator. Is it running?");
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // keep raw text
    }
    throw new Error(message || `Orchestrator returned ${res.status}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}
