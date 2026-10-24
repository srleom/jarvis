// Demo data for local development: `npx convex run seed:demo`
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  DEFAULT_BEHAVIOUR_INSTRUCTIONS,
  DEFAULT_POST_MEETING_INSTRUCTIONS,
} from "./lib/constants";

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const agentId = await ctx.db.insert("agents", {
      name: "Jarvis",
      slackChannelId: "C0DEMO0001",
      behaviourInstructions: DEFAULT_BEHAVIOUR_INSTRUCTIONS,
      postMeetingInstructions: DEFAULT_POST_MEETING_INSTRUCTIONS,
      mossIndexName: "",
      memberCount: 0,
      meetingCount: 0,
      createdAt: now - 3 * 86400_000,
    });
    await ctx.db.patch("agents", agentId, { mossIndexName: `jarvis-${agentId}` });

    const members: [string, string][] = [
      ["Ava Chen", "U0DEMOAVA"],
      ["Ben Okafor", "U0DEMOBEN"],
      ["Sam Rivera", "U0DEMOSAM"],
      ["Priya Nair", "U0DEMOPRI"],
    ];
    for (const [name, slackUserId] of members) {
      await ctx.db.insert("teamMembers", { agentId, name, slackUserId });
    }

    const startedAt = now - 26 * 3600_000;
    const meetingId = await ctx.db.insert("meetings", {
      agentId,
      meetUrl: "https://meet.google.com/abc-defg-hij",
      recallBotId: "demo-bot",
      title: "Hackathon venue and setup plan",
      status: "ended",
      mossDocIds: [],
      startedAt,
      endedAt: startedAt + 34 * 60_000,
    });

    const lines: [string, string][] = [
      ["Ava Chen", "Okay, let's kick off. Main thing today is the venue for the spring hackathon."],
      ["Sam Rivera", "Our budget for the venue is ten thousand dollars, max."],
      ["Ava Chen", "Let's go with the Palace of Fine Arts if it's under 10k."],
      ["Priya Nair", "Hey Jarvis, how much does it cost to rent the Palace of Fine Arts, and does it fit our budget?"],
      ["Jarvis", "The Palace of Fine Arts lists full-day rentals from about $8,500, so it fits your $10k budget with some room for AV."],
      ["Sam Rivera", "Great, then that's decided. Palace of Fine Arts."],
      ["Ava Chen", "Sam, can you email them to hold the date by Friday?"],
      ["Sam Rivera", "Yep, I'll do it tomorrow."],
      ["Jarvis", "Ben says: I think we should do setup at 4pm instead. I'll join in 10 minutes."],
      ["Ava Chen", "Tell Ben we like it, but the venue only opens at 3."],
      ["Priya Nair", "I'll draft the sponsor deck. Still open: do we need overnight security?"],
    ];
    let t = 12;
    for (const [speaker, text] of lines) {
      await ctx.db.insert("transcriptSegments", { meetingId, speaker, text, startTime: t, isFinal: true });
      t += 40 + Math.round(Math.random() * 50);
    }

    const notes: [
      "topics" | "decisions" | "questions" | "actions" | "answers",
      string,
      string?,
      string?,
    ][] = [
      ["topics", "Spring hackathon venue"],
      ["topics", "Setup schedule"],
      ["topics", "Sponsor outreach"],
      ["decisions", "Venue: Palace of Fine Arts"],
      ["decisions", "Venue budget capped at $10k"],
      ["questions", "Do we need overnight security?"],
      ["actions", "Email venue to hold the date by Friday", "Sam"],
      ["actions", "Draft the sponsor deck", "Priya"],
      ["answers", "Palace of Fine Arts from ~$8,500/day, fits budget", undefined, "https://palaceoffinearts.com/rentals"],
    ];
    for (const [column, text, owner, sourceUrl] of notes) {
      await ctx.db.insert("boardNotes", { meetingId, column, text, owner, sourceUrl, createdAt: now, updatedAt: now });
    }

    await ctx.db.insert("answers", {
      meetingId,
      askedBy: "Priya Nair",
      question: "How much does it cost to rent the Palace of Fine Arts, and does it fit our budget?",
      spokenAnswer:
        "The Palace of Fine Arts lists full-day rentals from about $8,500, so it fits your $10k budget with some room for AV.",
      sourceUrl: "https://palaceoffinearts.com/rentals",
      toolLog: [
        { tool: "web_search", input: "Palace of Fine Arts rental cost", status: "ok", ms: 840 },
        { tool: "read_page", input: "https://palaceoffinearts.com/rentals", status: "ok", ms: 2100 },
      ],
      createdAt: startedAt + 4 * 60_000,
    });

    await ctx.db.insert("relayRequests", {
      meetingId,
      fromSlackUserId: "U0DEMOBEN",
      fromName: "Ben Okafor",
      message: "Tell the team I think we should do setup at 4pm instead. I'll join in 10 minutes.",
      preview: "Ben has a message about setup time.",
      status: "answered",
      teamAnswer: "Tell Ben we like it, but the venue only opens at 3.",
      slackReply: "The team likes the 4pm idea. One catch: \"the venue only opens at 3\", so setup can start any time after that.",
      createdAt: startedAt + 9 * 60_000,
      updatedAt: startedAt + 10 * 60_000,
    });

    await ctx.db.insert("avatarState", { meetingId, state: "listening" });

    await ctx.db.insert("meetingNotes", {
      meetingId,
      agentId,
      markdown: `## Summary
The team picked the Palace of Fine Arts for the spring hackathon, within the $10k venue budget. Ben suggested a 4pm setup; the venue opens at 3pm.

## Decisions
- Venue: Palace of Fine Arts
- Venue budget capped at $10k

## Action items
**Sam**
- Email the venue to hold the date by Friday

**Priya**
- Draft the sponsor deck

## Questions Jarvis answered
- *How much does it cost to rent the Palace of Fine Arts?* From about $8,500 a day, which fits the budget. ([palaceoffinearts.com](https://palaceoffinearts.com/rentals))

## Still open
- Do we need overnight security?`,
      createdAt: startedAt + 35 * 60_000,
    });

    await ctx.db.patch("agents", agentId, { memberCount: members.length, meetingCount: 1 });
    return agentId;
  },
});

/**
 * A meeting in "joining" state with a fake bot id, for driving the orchestrator with
 * simulated Recall events: `npx convex run seed:liveMeeting '{"agentId":"..."}'`
 */
export const liveMeeting = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get("agents", agentId);
    if (!agent) throw new Error("Agent not found");
    const meetingId = await ctx.db.insert("meetings", {
      agentId,
      meetUrl: "https://meet.google.com/sim-ulat-ion",
      recallBotId: `sim-${Date.now()}`,
      status: "joining",
      mossDocIds: [],
      startedAt: Date.now(),
    });
    await ctx.db.insert("avatarState", { meetingId, state: "listening" });
    await ctx.db.patch("agents", agentId, { meetingCount: agent.meetingCount + 1 });
    return meetingId;
  },
});
