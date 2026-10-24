import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** "topics" is legacy: boards from before topic cards used it. New notes use the other four. */
export const boardColumn = v.union(
  v.literal("topics"),
  v.literal("decisions"),
  v.literal("questions"),
  v.literal("actions"),
  v.literal("answers"),
);

export const topicStatus = v.union(v.literal("upcoming"), v.literal("active"), v.literal("done"), v.literal("dropped"));

export const meetingStatus = v.union(v.literal("joining"), v.literal("live"), v.literal("ended"), v.literal("failed"));

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

export const stateChangeKind = v.union(v.literal("add"), v.literal("update"), v.literal("remove"));

export const proposalStatus = v.union(v.literal("pending"), v.literal("accepted"), v.literal("dismissed"));

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
    /** What the meeting is for. Set by the lead, or inferred by the whiteboard loop from what the team says. */
    goal: v.optional(v.string()),
    status: meetingStatus,
    error: v.optional(v.string()),
    mossDocIds: v.array(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_and_status", ["agentId", "status"])
    .index("by_status", ["status"])
    .index("by_recallBotId", ["recallBotId"]),

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

  /** Agenda items. Added, renamed, finished and dropped as the conversation moves. */
  boardTopics: defineTable({
    meetingId: v.id("meetings"),
    title: v.string(),
    status: topicStatus,
    /** One line on where the topic landed, set when it is done. */
    outcome: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_meeting", ["meetingId"]),

  boardNotes: defineTable({
    meetingId: v.id("meetings"),
    /** Missing on notes from before topic cards. */
    topicId: v.optional(v.id("boardTopics")),
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

  /** What the team has agreed so far. Newer than uploaded documents, so memory search ranks it first. */
  stateFacts: defineTable({
    agentId: v.id("agents"),
    text: v.string(),
    /** The meeting this fact came from, when it was accepted from a proposal. */
    sourceMeetingId: v.optional(v.id("meetings")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_agent", ["agentId"]),

  /** Changes to the project state proposed after a meeting, waiting for review. */
  stateProposals: defineTable({
    agentId: v.id("agents"),
    meetingId: v.id("meetings"),
    kind: stateChangeKind,
    /** The new fact for add and update; the reason for remove. */
    text: v.string(),
    factId: v.optional(v.id("stateFacts")),
    /** The fact's text when the change was proposed, for update and remove. */
    previousText: v.optional(v.string()),
    status: proposalStatus,
    createdAt: v.number(),
  })
    .index("by_agent_and_status", ["agentId", "status"])
    .index("by_meeting", ["meetingId"]),

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
