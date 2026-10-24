/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as calendars from "../calendars.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_orchestrator from "../lib/orchestrator.js";
import type * as meetings from "../meetings.js";
import type * as memory from "../memory.js";
import type * as notes from "../notes.js";
import type * as notesData from "../notesData.js";
import type * as orchestrator from "../orchestrator.js";
import type * as seed from "../seed.js";
import type * as team from "../team.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  calendars: typeof calendars;
  cleanup: typeof cleanup;
  crons: typeof crons;
  documents: typeof documents;
  "lib/constants": typeof lib_constants;
  "lib/orchestrator": typeof lib_orchestrator;
  meetings: typeof meetings;
  memory: typeof memory;
  notes: typeof notes;
  notesData: typeof notesData;
  orchestrator: typeof orchestrator;
  seed: typeof seed;
  team: typeof team;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
