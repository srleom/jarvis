import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const boardColumn = v.union(
  v.literal("topics"),
  v.literal("decisions"),
  v.literal("questions"),
  v.literal("actions"),
  v.literal("answers"),
);

export const meetingStatus = v.union(
  v.literal("scheduled"),
  v.literal("joining"),
  v.literal("live"),
  v.literal("ended"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const avatarStateValue = v.union(
  v.literal("listening"),
  v.literal("thinking"),
  v.literal("hand_raised"),
  v.literal("speaking"),
);

export const relayStatus = v.union(
  v.literal("queued"),
  v.literal("hand_raised"),
  v.literal("speaking"),
  v.literal("awaiting_answer"),
  v.literal("answered"),
  v.literal("expired"),
);

export const documentStatus = v.union(v.literal("indexing"), v.literal("ready"), v.literal("failed"));

export const toolLogEntry = v.object({
  tool: v.string(),
  input: v.string(),
  status: v.string(),
  ms: v.number(),
});

export default defineSchema({
  agents: defineTable({
    name: v.string(),
    /** Free text for people, e.g. which project this agent is assigned to. Not sent to the model. */
    description: v.optional(v.string()),
    slackChannelId: v.string(),
    behaviourInstructions: v.string(),
    postMeetingInstructions: v.string(),
    mossIndexName: v.string(),
    memberCount: v.number(),
    meetingCount: v.number(),
    createdAt: v.number(),
  }),

  teamMembers: defineTable({
    agentId: v.id("agents"),
    name: v.string(),
    slackUserId: v.string(),
    avatarUrl: v.optional(v.string()),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_and_slackUserId", ["agentId", "slackUserId"])
    .index("by_slackUserId", ["slackUserId"]),

  documents: defineTable({
    agentId: v.id("agents"),
    fileName: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    status: documentStatus,
    error: v.optional(v.string()),
    mossDocIds: v.array(v.string()),
    uploadedAt: v.number(),
  }).index("by_agent", ["agentId"]),

  meetings: defineTable({
    agentId: v.id("agents"),
    meetUrl: v.string(),
    recallBotId: v.optional(v.string()),
    title: v.optional(v.string()),
    status: meetingStatus,
    error: v.optional(v.string()),
    mossDocIds: v.array(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    /** "calendar" meetings are scheduled from a linked Calendar V2 event; the rest are pasted links. */
    source: v.optional(v.union(v.literal("manual"), v.literal("calendar"))),
    calendarEventId: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
    scheduledEnd: v.optional(v.number()),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_and_status", ["agentId", "status"])
    .index("by_status", ["status"])
    .index("by_recallBotId", ["recallBotId"])
    .index("by_calendarEventId", ["calendarEventId"]),

  /** A Recall Calendar V2 calendar whose events are scheduled for one agent. */
  calendarLinks: defineTable({
    agentId: v.id("agents"),
    recallCalendarId: v.string(),
    platformEmail: v.optional(v.string()),
    /** ISO timestamp of the newest event update we have processed. */
    syncedThrough: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_recallCalendarId", ["recallCalendarId"]),

  /** Recall webhook message ids already handled, so retries don't repeat side effects. */
  webhookEvents: defineTable({
    eventId: v.string(),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_createdAt", ["createdAt"]),

  transcriptSegments: defineTable({
    meetingId: v.id("meetings"),
    speaker: v.string(),
    text: v.string(),
    startTime: v.number(),
    isFinal: v.boolean(),
  }).index("by_meeting", ["meetingId"]),

  boardNotes: defineTable({
    meetingId: v.id("meetings"),
    column: boardColumn,
    text: v.string(),
    owner: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_meeting", ["meetingId"]),

  answers: defineTable({
    meetingId: v.id("meetings"),
    askedBy: v.string(),
    question: v.string(),
    spokenAnswer: v.string(),
    sourceUrl: v.optional(v.string()),
    toolLog: v.array(toolLogEntry),
    createdAt: v.number(),
  }).index("by_meeting", ["meetingId"]),

  relayRequests: defineTable({
    meetingId: v.id("meetings"),
    fromSlackUserId: v.string(),
    fromName: v.string(),
    message: v.string(),
    preview: v.string(),
    status: relayStatus,
    teamAnswer: v.optional(v.string()),
    slackReply: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_meeting", ["meetingId"])
    .index("by_meeting_and_status", ["meetingId", "status"]),

  avatarState: defineTable({
    meetingId: v.id("meetings"),
    state: avatarStateValue,
    preview: v.optional(v.string()),
  }).index("by_meeting", ["meetingId"]),

  meetingNotes: defineTable({
    meetingId: v.id("meetings"),
    agentId: v.id("agents"),
    markdown: v.string(),
    slackMessageTs: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_meeting", ["meetingId"])
    .index("by_agent", ["agentId"]),
});
