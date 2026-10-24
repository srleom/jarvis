import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type AgentDetail = NonNullable<FunctionReturnType<typeof api.agents.get>>;
