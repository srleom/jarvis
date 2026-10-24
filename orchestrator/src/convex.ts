import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { api as GeneratedApi } from "../../web/convex/_generated/api.js";
import type { Doc, Id } from "../../web/convex/_generated/dataModel.js";
import { config } from "./config.js";

export const convex = new ConvexHttpClient(config.convexUrl);
export const secret = config.secret;
// Typed against the web app's generated API; anyApi builds the same function references at runtime.
export const api = anyApi as unknown as typeof GeneratedApi;
export type { Doc, Id };
