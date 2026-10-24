import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("prune webhook ids", { hours: 6 }, internal.webhooks.prune, {});

export default crons;
