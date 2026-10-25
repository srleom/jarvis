# Jarvis - App Overview

For Cal Hacks 13.0. This document is the build spec for the MVP. Section 9 onward is written for the coding agent.

Status: all P0 and P1 flows are built. Of the P2 items, only asking Jarvis about past meetings on Slack works. The sections below describe the app as built.

## 1. What it is

Jarvis is an AI teammate that joins your team's Google Meet calls and keeps the meeting on track.

During a call it does three things:

1. **Scribes the discussion onto a live whiteboard.** Jarvis shares its screen. The board tracks the meeting's goal and its agenda as topics. Under the current topic, decisions, open questions and action items appear as sticky notes as the team talks.
2. **Answers questions out loud.** Someone says "Hey Jarvis" and asks a question. Jarvis uses what's been said in the call, the team's memory and a web search to answer. It can also draft a Slack DM to a teammate on request, and sends it once the asker confirms.
3. **Connects the call to people who aren't in it.** A late teammate DMs Jarvis on Slack. Jarvis catches them up without interrupting anyone. If they want to tell the team something, Jarvis raises its hand, reads the message when the team is ready, and sends the team's answer back to Slack.

When the call ends, Jarvis posts meeting notes to Slack and proposes updates to the team's project state (the list of facts the team has agreed on). A web dashboard lists all your agents. Each agent has its own page with its team, memory, custom instructions, and every meeting it has joined with its notes.

## 2. Problem

**Small teams lose the flow of their meetings when they need information or when an absent teammate needs to be brought in.**

It shows up in two ways:

1. **Inside the meeting.** Someone asks "How much does the Palace of Fine Arts cost to rent?" Someone opens a laptop to check. The discussion stalls. Meanwhile nobody is writing down what's been decided.
2. **Outside the meeting.** A teammate who is late has no way in. When they join, someone spends five minutes catching them up. If they have an idea before they join, they message someone in the call and pull that person out of the conversation.

## 3. Target users

**Primary: student organization leadership teams planning events.** For example, the organizing team of a student hackathon or the exec board of a campus club. 4 to 10 people who meet on Google Meet several times a week, coordinate on Slack, and juggle classes, so someone is almost always late or missing. Their meetings are full of questions that need a quick lookup (venue prices, sponsor details, dates) and decisions that need to be written down.

We name a specific community on purpose. Judges (Anthropic in particular) reward a clearly named user over "small teams". The product still works for any small team on Meet and Slack.

**Secondary: late or absent teammates.** On Slack on their phone. They want to catch up or weigh in without joining the call yet.

**Setup user: the team lead.** Sets Jarvis up on the dashboard, writes its instructions, and sends it into calls.

## 4. Jobs-to-be-done

1. **See what we've discussed and decided, as it happens.**
2. **Get an answer during the meeting without anyone leaving the conversation.**
3. **Catch up and get my input in when I can't be there yet.**
4. **Let the team decide when it gets interrupted.**
5. **Have the notes waiting in Slack when the meeting ends, and findable later.**

## 5. Core flows

Priority levels:

- **P0:** must work for the demo. Build these first, in this order.
- **P1:** build next, in this order, once P0 runs end to end.
- **P2:** only if there's time.

### Dashboard structure

The dashboard is organised around agents. The home page lists every agent. Clicking an agent opens that agent's page, where everything about it lives: its team, its memory, its instructions, and every meeting it has joined with the notes for each. No login.

```
Agents (home)
└── Agent page
    ├── Meetings tab (default)
    │   └── Meeting detail
    ├── Team tab
    ├── Memory tab
    ├── Instructions tab
    └── Settings tab
```

**Agents (home page)**

- One card per agent: name, description, number of team members, number of meetings, and status (live, joining or idle).
- A "New agent" button. It asks for a name, an optional description (for people, for example which project the agent is assigned to; never sent to the model) and a Slack channel, creates the agent, and opens its page.

**Agent page**

The header shows the agent's name, description and status, plus a "Send to a meeting" box: paste a Google Meet link, optionally add a meeting goal ("pick a venue and set the budget"), click Send. If the agent is already in a meeting, the box links to that meeting and offers a button to make the agent leave. An agent can only be in one meeting at a time.

Below the header are five tabs:

- **Meetings.** Every meeting this agent has joined, newest first. Each row shows a title (generated from the notes), date, duration, and a "Live" badge if it's in progress. Clicking a row opens the meeting detail page, with tabs:
  - Notes (same as the Slack post)
  - Whiteboard: the goal (editable), topics and their notes. Live while the meeting is in progress, with a link to the screenshare view.
  - Answers: questions Jarvis answered, with sources and a log of every tool call
  - Relay log: who asked what, what the team answered, and the reply sent to Slack
  - Transcript: the full transcript with speaker names, searchable
  - A delete button, which also removes the meeting from memory
- **Team.** The people who can use this agent. Each member has a name, a Slack account and a Slack avatar. Add a member by picking from the Slack workspace's user list, or by pasting a Slack user ID. Remove with one click. Only team members can DM this agent for a catch-up, a question or a relay, and only they can be sent a DM from the call.
- **Memory.** What this agent knows:
  - **Project state:** a short list of facts the team has agreed on ("Venue budget is $40k"). Add, edit and delete facts by hand. After each meeting, Jarvis proposes additions, updates and removals. Each proposal waits here for someone to accept (optionally after editing) or dismiss it. The tab shows a badge with the number waiting.
  - A search box that runs the same memory search Jarvis uses, so you can see what it would find
  - Starting documents: upload (PDF, Markdown or text) and delete
  - Past meeting notes it can draw on
- **Instructions.** Two text boxes:
  - **Behaviour instructions.** Added to every prompt. Example: "Keep answers under 20 seconds. Prices in USD."
  - **Meeting notes instructions.** Controls what goes into the meeting notes. Default: "Summary, decisions, action items by owner."
- **Settings.** Rename the agent, change its description and Slack channel, delete the agent.

**What's P0 and what's P1**

- **P0 (P0-1 below):** the agents list, creating an agent, the agent page header with "Send to a meeting", the Team tab, and document upload in the Memory tab. The live flows need these to work.
- **P1, in this order:** the Meetings tab and meeting detail page (P1-1), the rest of the Memory tab (P1-2), the Instructions tab (P1-3). The Settings tab comes last.

### P0-1. Create an agent and send it to a meeting

1. On the Agents page, click "New agent". Enter a name (default "Jarvis"), an optional description, and a Slack channel for meeting notes.
2. On the agent's page, add team members on the Team tab.
3. Upload context documents on the Memory tab, for example the client brief.
4. Paste a Google Meet link in the header, optionally add a goal, and click Send.

The agent's name is also its wake word. An agent named "Nova" answers to "Hey Nova". The rest of this document uses "Jarvis".

### P0-2. Jarvis joins the call

- Jarvis joins the Meet as a named participant. Someone in the call admits it.
- On joining, Jarvis says out loud, and posts as a pinned chat message: "Hi, I'm Jarvis. I'm transcribing this meeting and taking notes. Say 'Hey Jarvis' to ask me something, or remove me from the call to stop."
- Jarvis shares its screen. The screen shows the whiteboard with a small avatar in the bottom-right corner.
- The avatar has four states: listening, thinking, hand raised, speaking.
- Everything said is transcribed with speaker names and stored. Everything Jarvis says out loud is also posted in Meet chat, in case its audio is choppy.

### P0-3. Live whiteboard

The board is organised around the meeting's agenda:

- **Goal** at the top: what the meeting is for. Set when the agent is sent, edited on the meeting page, or inferred by Jarvis once the team says what the meeting is for. It shows progress as topics done out of total.
- **Topics.** Exactly one topic is active: what the team is discussing now. Finished topics collapse to a single row with a one-line outcome ("Parked, needs venue quotes"). Upcoming topics are listed below. Topics can also be dropped.
- **Notes** inside the active topic, in three slots: Decided, Open (questions and proposals) and To do (action items, each with an owner if one was named).
- **Answers** to questions Jarvis was asked, with the source domain, attached to the topic that was active at the time.

After the team pauses, Jarvis looks at the new transcript since the last update and the current board. It returns small changes: start, rename, finish, reopen or drop a topic; add a note, edit a note, move a note to another slot, or remove a note; set the goal. If nothing changed, it returns no changes.

Notes are short, under 12 words. The model never chooses positions. The page lays out notes in their slot, top to bottom, in the order they were created.

Example: someone says "Let's go with the Palace of Fine Arts if it's under 10k." A note "Palace of Fine Arts, if under $10k" appears under Open in the "Venue" topic. A minute later the team confirms. The note moves to Decided. When the team moves on to catering, "Venue" collapses with the outcome "Palace of Fine Arts, under $10k".

### P0-4. Ask Jarvis

Someone says "Hey Jarvis, how much does it cost to rent the Palace of Fine Arts, and does it fit our budget?"

1. Within 1 second of "Hey Jarvis", the avatar switches to thinking.
2. When the person finishes the question, Jarvis says a short filler out loud: "Let me check."
3. Jarvis decides what it needs. It can use any of these:
   - **The call so far** (recent transcript, always included)
   - **Memory** (context documents, earlier parts of this call, past meeting notes)
   - **Web search** (search results, then read the top page if the snippets aren't enough)
4. Jarvis answers out loud in one to three sentences. In this example it finds the rental price on the web and the budget in the call ("you said 10k earlier").
5. An answer note appears on the board under the active topic, with the source domain (for example "palaceoffinearts.com").

If the web search fails or takes too long, Jarvis answers from what it has and says it couldn't confirm online.

### P0-4b. Ask Jarvis to message a teammate

Someone says "Hey Jarvis, tell Ben on Slack the venue is confirmed."

1. Jarvis matches "Ben" against the Team tab (full name, then first name, then partial match). If nobody or several people match, it says so and asks who they mean.
2. Jarvis reads the draft back: "Send Ben this on Slack: the venue is confirmed. Say yes to send it, or no to cancel."
3. If the person who asked says yes (out loud or in chat) within 45 seconds, Jarvis DMs Ben ("Ana asked me to pass this on from the meeting: ...") and says "Sent to Ben." "No" cancels it. Silence lets it expire.

Jarvis never sends a DM without that confirmation, and never because of text it found on the web or in memory.

### P0-5. Catch-up for a late teammate

Ben is running late. He DMs Jarvis on Slack: "What have I missed?"

- Jarvis replies in Slack with a short summary: what's been discussed, what's been decided, what's still open.
- The call hears nothing.

Ben can also ask a factual question about the call ("Did we pick a venue?") and get a Slack answer without interrupting anyone.

### P0-6. Two-way relay

After reading the summary, Ben DMs Jarvis: "Tell the team I think we should do setup at 4pm instead. I'll join in 10 minutes."

1. Jarvis replies to Ben: "Got it, I'll raise it with the team."
2. Jarvis raises its hand. The avatar shows a raised hand with a one-line preview: "Ben has a message about setup time." The same line is posted in the Meet chat.
3. Someone says "Go ahead, Jarvis" (or types "go" in Meet chat). Jarvis reads Ben's message out loud.
4. Jarvis listens for the team's answer. For example: "Tell Ben we like it, but the venue only opens at 3."
5. Jarvis sends that answer to Ben on Slack, in Jarvis's words, quoting the key point.
6. If someone says "Not now, Jarvis" (or types "not now" in chat), the hand stays raised until the team says go.

Only one hand can be raised at a time. Extra relay requests wait in a queue.

### P0-7. Meeting notes

When the call ends, Jarvis posts to the Slack channel:

- Summary
- Decisions
- Action items by owner
- Questions Jarvis answered, with sources

The notes are also saved under the meeting on the agent's Meetings tab (P1-1).

Then Jarvis compares what the meeting settled with the project state and proposes changes, for example "Venue budget is $40k (was $50k)". If there are any, it replies in the notes thread on Slack that they're waiting for review in the Memory tab. Nothing changes the project state until someone accepts it.

### P1-1. Meetings tab and meeting detail

As described in "Dashboard structure": the agent's meetings, newest first, each opening to its notes, whiteboard, answers, relay log and transcript.

### P1-2. Memory tab

As described in "Dashboard structure": project state and its proposals, the memory search box, documents, and past meeting notes. (Document upload alone is P0.)

### P1-3. Instructions tab

As described in "Dashboard structure": behaviour instructions and meeting notes instructions.

### P2 (only if time)

1. **Jarvis on ASI:One (Fetch.ai).** A second way for an absent teammate to reach Jarvis, alongside Slack. A uAgent registered on Agentverse that supports catch-up and relay inside an ASI:One conversation. See section 8 for the rules it must meet. Not built.
2. Ask Jarvis on Slack days later: "What did we decide about the venue?" Built: Slack questions draw on memory and the last 10 meetings with their dates.
3. Jarvis raises its hand on its own when it notices something useful, at most once every 5 minutes. Not built.

## 6. Existing alternatives

| Alternative               | What it does                                             | What it misses                                                                    |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Gemini in Google Meet     | Takes notes and answers questions about the meeting.     | No live whiteboard. No way for an absent teammate to get a message into the call. |
| Otter Meeting Agent       | Answers voice questions in calls. Shares notes in Slack. | No relay from Slack into the live call and back.                                  |
| Slackbot (Slack AI)       | Summarises and answers questions in Slack.               | Doesn't speak in the call.                                                        |
| Granola, Fireflies        | Record and summarise meetings.                           | Never speak. Notes arrive after the meeting.                                      |
| Meeting bot APIs (Recall) | Let developers put a speaking bot into a call.           | Infrastructure, not a product. Jarvis is built on one.                            |
| Do nothing                | Someone takes notes. People ping each other mid-call.    | Notes are late. Late teammates need catching up.                                  |

**The gap:** notes and voice Q&A are table stakes. What we couldn't find is a two-way live relay: a teammate's Slack message raised politely in the call, and the team's spoken answer sent back. The live whiteboard makes the meeting itself visibly better. The demo is built around both.

## 7. Business model

Out of scope. Hackathon only.

## 8. Sponsor tools and prize tracks

Based on the [Cal Hacks 13.0 prize page](https://hive.hackberkeley.org/prizes) (updated Oct 24). Every sponsor tool must do a real job in the working product. Several tracks disqualify or mark down tools that are only mentioned in the README.

### Tracks we build for

| Track                    | Prize              | How Jarvis qualifies                                                                                                                                                                                         | What the rules ask for                                                                                                                                                                                                                                  |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Best use of Convex**   | $5,000             | Convex is the backend: all data, live queries driving the whiteboard and dashboard, file storage for documents, scheduled actions for meeting notes and project-state proposals, a cron for webhook cleanup. | Build on Convex's database, functions, workflows, sync, search and file storage. "Use real Convex features like live queries and components to win." We don't use any Convex components yet.                                                            |
| **Best Use of Cartesia** | Meta glasses (TBD) | Jarvis's whole voice is Cartesia Sonic. Voice is how the team talks to Jarvis and how Ben's message reaches the room.                                                                                        | Voice must be core. 2-minute demo-first presentation. README listing Cartesia features used and known limitations. No keys in the repo. Judged 25% each on problem, use of Cartesia, execution, and impact and responsibility (accessibility, privacy). |
| **Best Use of Moss**     | AirPods Max/Pro    | Moss is Jarvis's memory search, queried mid-conversation. Fits their "Voice AI" example exactly.                                                                                                             | Voice agents that listen, respond and act in real time.                                                                                                                                                                                                 |
| **Anthropic**            | Not posted yet     | Claude does all reasoning.                                                                                                                                                                                   | A named community, a real problem, one thing that works well, and thoughtful use of Claude including where it could go wrong.                                                                                                                           |

context.dev, our web provider, has no prize track. Web search no longer counts toward any sponsor prize (see "Considered and skipped").

### Tracks we submit to with no extra build

| Track                                                      | Why it fits                                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Microsoft Grand Prize: Built for the Real World**        | A production-minded productivity agent. Judged on customer understanding, measurable usefulness, path to production, responsible design and end-to-end function. |
| **Microsoft Customer Impact Award**                        | Same criteria as the Grand Prize.                                                                                                                                |
| **Meta: Bringing People Closer Together with AI**          | The relay keeps absent teammates connected to their team in real time. Judged on human connection, how essential AI is, originality and the working demo.        |
| **MLH: Best Use of Gen AI**                                | Built on the Claude API.                                                                                                                                         |
| **Cal Hacks: Most Technically Complex, Best People-First** | General tracks.                                                                                                                                                  |

### Optional (P2)

| Track                               | Prize                  | What it would take                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Best Use of Fetch.ai**            | $1,500 / $1,000 / $500 | A uAgent registered on Agentverse, implementing the Agent Chat Protocol, discoverable on ASI:One. The primary workflow must be completable entirely inside an ASI:One conversation. For Jarvis: catch-up and relay from ASI:One instead of Slack. Also needs a public repo, the Innovation Lab badges in the README, a 3 to 5 minute video, and registration through their ASI:One submission agent. About half a day of work. |
| **Creao AI: Best Team Empowerment** | Share of $1,000        | Rules are in a Google Doc linked from the prize page. Read it before deciding. It may require building with Creao.                                                                                                                                                                                                                                                                                                             |

### Considered and skipped

- **Cartesia Ink (speech-to-text):** Recall's own transcript labels speakers, which we need for action item owners. Ink would mean pulling each speaker's raw audio from Recall and streaming it to Ink ourselves.
- **Bright Data and Apify:** we started on Bright Data, briefly moved to Apify, then settled on context.dev, which has no prize track. context.dev's search returns the passages that match the query with each result, so Claude rarely needs a second call to read a page. `pnpm -C orchestrator bench:search` compares the three on the same queries. The cost: we give up the Bright Data track (1st: $1,500 credits + $500, down to 3rd: $500 credits + $250) and the Apify track ($5,000 across the top 5, from $2,000 down to $400). Apify asks only for meaningful use. Bright Data needs the web data to be essential, handles blocks, slow responses and empty results, and no mocked data.
- **Spacetime:** a realtime backend that competes with Convex. Convex has the bigger prize and covers more of what we need.
- **ElevenLabs (MLH):** competes with Cartesia.
- **Factory Droid SDK:** the prize needs Droid doing real work inside the running product, not just writing our code. No natural place for it in Jarvis.
- **Atlassian:** Best Agent / Best Security Solution for Agents. Rules are in a linked Google Doc; when we last read them they needed a Forge app inside Jira or Confluence. Too far from the core product.
- **Mana:** rewards using Mana while building (bonus if the project lives inside Mana). Fine to use as a build tool, but not part of the product.
- **Backboard (MLH):** AI memory API. Overlaps with Moss.
- **Not relevant:** Notability, Capital One, Coinbase, CRS, Hyphenate, Bitdeer AI, Visa, SpaceXAI, Figma, the other MLH tracks (databases, cloud, hardware, domains).
- **Rules not posted yet:** Elastic, Armadin (security), AfterQuery, Annapurna Labs. Check again before submitting.

### Responsible use (for Cartesia, Anthropic and Microsoft judging)

- When Jarvis joins, it says out loud and in chat that it is transcribing the meeting, and how to remove it.
- Jarvis only speaks when addressed or granted. It never reads a relay message without a grant.
- Jarvis never sends a Slack DM from the call without the asker confirming out loud or in chat.
- Each agent only talks to people on its Team tab. A DM from anyone else gets a polite refusal.
- Project state only changes when a person accepts a proposal.
- The dashboard can delete a meeting and its transcript, which also removes it from Moss.
- The whiteboard doubles as a live visual record of the meeting, which helps teammates who are hard of hearing or joining late.
- Web answers always show their source on the board, so the team can check them.

## 9. Architecture

### Components

1. **Dashboard** (Next.js, React). Agents list and agent pages (see "Dashboard structure" in section 5). Reads and writes Convex. Routes: `/` (agents), `/agents/[agentId]` (agent page, tab in the query string), `/agents/[agentId]/meetings/[meetingId]` (meeting detail).
2. **Bot page** (one route of the same Next.js app, for example `/bot/[meetingId]`). This is the page Recall renders as Jarvis's screenshare. It shows the tldraw whiteboard and the avatar, and plays Jarvis's voice.
3. **Orchestrator** (Node.js, TypeScript, Express, long-running server). The brain. Receives Recall's webhooks and live transcript and chat events, runs the wake word, whiteboard loop, Q&A and relay, calls Claude, Cartesia, Moss and context.dev, and runs the Slack bot. It owns Moss, because the Moss SDK is a native module that can't run in Convex.
4. **Convex.** Stores everything. The dashboard and the bot page subscribe to it, so changes show up live. Uploaded documents go in Convex file storage. Meeting notes and project-state proposals run as Convex actions after the call ends. Use Convex for anything that doesn't need a long-lived connection, since Convex is a prize track.

The orchestrator must be reachable from the public internet so Recall can send it events. We run it locally behind a static ngrok domain. The web app is deployed to Vercel, and Convex runs as a cloud deployment.

### External services

| Service     | Purpose                                                         |
| ----------- | --------------------------------------------------------------- |
| Recall.ai   | Puts the bot in Google Meet, live transcript, chat, screenshare |
| Claude API  | All reasoning (see "Models" below)                              |
| Cartesia    | Text-to-speech                                                  |
| Moss        | Memory search                                                   |
| context.dev | Web search and page reading                                     |
| Slack       | Bot DMs and channel posts                                       |
| Convex      | Database and live sync                                          |

### How the pieces talk

- **Recall to orchestrator:** bot status webhooks (`bot.joining_call`, `bot.in_waiting_room`, `bot.in_call_recording`, `bot.call_ended`, `bot.done`, `bot.fatal`) at `/recall/webhooks`, and live transcript (partial and final, with speaker name) and chat at `/recall/realtime/`. Every request is verified against Recall's webhook secret, and webhook message IDs are de-duplicated in Convex. As a fallback, the orchestrator polls each live bot's status every 10 seconds.
- **Orchestrator to Recall:** create bot, send a chat message, remove bot, get bot status.
- **Convex to orchestrator:** HTTP calls with a shared secret (`ORCHESTRATOR_SECRET`): start and stop a meeting's bot, and index, add, delete and search memory.
- **Orchestrator to Convex:** writes transcript segments, board topics and notes, answers, relay requests, avatar state and meeting status.
- **Convex to bot page:** the page subscribes to the board and avatar state for its meeting, and redraws when they change.
- **Orchestrator to bot page (audio):** a WebSocket. The orchestrator streams Cartesia audio to the page, and the page plays it. Audio does not go through Convex.
- **Slack to orchestrator:** Slack Bolt in Socket Mode, so Slack needs no public URL. Convex posts meeting notes to Slack directly with the bot token.

### Key technical constraints

- **Voice must play inside the bot page.** Recall does not allow its separate audio output endpoint while a webpage is being streamed. The page plays audio with the Web Audio API. Test early that audio plays in Recall's browser without a user click.
- **Use screenshare, not camera,** for the bot page, so the whiteboard is readable. Check the exact Recall output media field for screenshare in their docs. Fall back to camera if screenshare doesn't work in Meet.
- **Page size is 1280x720.** Design the board for that. Minimum note text size 20px.
- **Keep the Cartesia key on the server.** The page never calls Cartesia directly.
- **Google Meet admission.** The bot waits in the lobby until someone admits it. That's fine for the demo.
- **Check Recall's current docs** for exact field and event names before coding. Don't guess them.

### Models

Use Claude for all reasoning. Check current model names on Anthropic's docs before coding.

- **Fast model (`claude-haiku-5-5`):** whiteboard updates, deciding what a Slack DM wants, raised-hand previews.
- **Stronger model (`claude-sonnet-5-5`):** answers to questions, catch-up summaries and Slack answers, relaying the team's answer, meeting notes, project-state proposals.

The wake word, "go ahead", "not now" and yes/no confirmations are matched with plain text rules, not a model, so they're fast and predictable.

All Claude calls that change state return JSON validated against a schema (zod). If validation fails, retry once, then skip.

## 10. Detailed behaviour

### Wake word

- Watch partial transcripts for "hey <agent name>" anywhere in an utterance (case-insensitive, punctuation stripped). Also accept "hi", "ok" and "okay" in place of "hey", and "<agent name>," at the start of an utterance. "Go ahead <agent name>" and "not now <agent name>" below are matched the same way, in either word order.
- On a match, set the avatar to thinking right away.
- Recall only finalises an utterance a while after the speaker stops. So once the wake word is heard, Jarvis treats the question as finished when the speaker's partial transcript hasn't changed for 800 ms, and answers from that. If the final transcript arrives first, it uses the final. The question is the text after the wake word.
- If there's no question (just "Hey Jarvis"), wait up to 5 more seconds for the next utterance from the same speaker.
- Ignore the wake word while Jarvis is speaking or already answering, and while it is reading a relay message or waiting for the team's answer to one.

### Answering a question

1. Speak "Let me check." immediately (Cartesia, cached audio is fine).
2. Call the stronger model with:
   - Behaviour instructions (P1-3)
   - The last 5 minutes of transcript
   - The question and who asked it
   - The team (names and Slack IDs), for drafting DMs
   - Tools: `search_memory(query)`, `web_search(query)`, `read_page(url)`, `draft_slack_dm(recipient, message)`
3. Tool behaviour:
   - `search_memory` queries Moss and returns the top 5 chunks with their source and date. Project-state facts get a ranking boost, and the prompt tells Claude to trust project state first, then the newest source, and to mention when a fact changed.
   - `web_search` calls context.dev search and returns the top 3 results (title, URL, snippet, and up to 1,500 characters of passages that match the query).
   - `read_page` calls context.dev scrape for the page's main content as markdown (a cached copy up to a day old is fine) and returns the first 4,000 characters.
   - `draft_slack_dm` resolves the recipient against the team and holds the draft. It sends nothing (see P0-4b).
4. Hard limits: at most 4 tool calls, 15 seconds total for tools. context.dev is asked to return partial results just before the deadline. When time is up, answer with what's available.
   - If a page is blocked or times out, try the next search result.
   - If search returns nothing, say so out loud rather than guessing.
   - Log every tool call (tool, input, status, time taken). The meeting page shows the log under each answer.
5. Output JSON: `{ spoken_answer, board_note, source_url }`. `spoken_answer` is one to three sentences.
6. Speak the answer (or the DM confirmation prompt). Add `board_note` to the board under the active topic. Save the answer.

### Whiteboard loop

- Run once the team pauses, so each update sees a complete thought: 2.5 seconds after the last final transcript segment, at most once every 5 seconds. During a long monologue, run anyway once the oldest unprocessed segment is 15 seconds old.
- Call the fast model with the meeting title and goal, the current topics (id, title, status, outcome) with their notes (id, slot, text, owner), and the new segments.
- It returns a list of operations:
  - `add { column, text, owner?, topicId? }` (no `topicId` means the active topic)
  - `update { id, text?, owner? }`
  - `move { id, column }`
  - `remove { id }`
  - `topic { id?, title?, status, outcome? }`: no `id` starts a new topic (status `active` or `upcoming`); with an `id` it renames, finishes, reopens or drops one. Starting a new active topic parks the previous one as done.
  - `goal { text }`: only when there's no goal yet, or the team clearly changes the meeting's purpose.
- Note slots are `decisions`, `questions` and `actions`. Answers are added by the Q&A flow, never by this loop.
- Rules in the prompt: at most 4 operations per update; don't duplicate an existing note; move a note rather than adding a new one when something gets decided; action items need an owner if one was named; don't invent topics from small talk.
- Invalid IDs are dropped before the operations are applied in one Convex mutation.

### Memory (Moss)

- One Moss index per agent.
- When a context document is uploaded, split it into chunks of about 500 words and add them. Metadata: source "doc", file name.
- Every 30 seconds during a call (once at least 60 new words have been said), add new transcript text in chunks of about 200 words. The rest is flushed when the call ends. Metadata: source "transcript", meeting ID, speakers, time.
- When meeting notes are generated, add them. Metadata: source "notes", meeting ID, date.
- When a project-state fact is added or edited, upsert it. Deleting it removes it. Metadata: source "state", date. Search ranks these above other sources.

### Slack DMs

There is one Slack bot for all agents. When someone DMs it, pick the agent first:

1. Find the agents whose Team tab includes the sender. If none, reply politely that they aren't on any agent's team.
2. If exactly one of those agents is in a live meeting, use it.
3. If several are live, ask which one, listing their names. Use the sender's next reply to choose.
4. If none are live, use the agent with the most recent meeting.

Replies come from the bot and start with the agent's name when it isn't "Jarvis", for example "Nova: here's what you missed".

Then classify the DM with the fast model into one of:

- `catch_up`: "What have I missed?" Reply with a summary of the current call (or the most recent call if none is live), built from its whiteboard, transcript and notes.
- `question`: a question about the call or past meetings. Answer in Slack from the current or latest meeting, the last 10 meetings with their dates, and memory search. If the answer isn't there, say so instead of guessing. Never interrupt the call.
- `relay`: a message for the team. Start the relay flow (P0-6).
- `unsupported`: something Jarvis can't do (sending email, booking things). Say so and explain what Jarvis can do.
- `other`: greetings and small talk. Reply briefly and explain what Jarvis can do.

If there's no live call and the DM is a relay, tell the sender there's no meeting running.

### Raised hand and grant

State machine for a relay request: `queued` then `hand_raised` then `speaking` then `awaiting_answer` then `answered` (or `expired`).

- `hand_raised`: avatar shows the hand and preview. Post a prominent hand-raised message in Meet chat via Recall, with the preview and how to grant it.
- Grant: a final transcript containing "go ahead jarvis" (or "go ahead, jarvis"), or a chat message that is exactly "go".
- Defer: "not now jarvis", or "not now" in chat. Stay in `hand_raised`.
- `speaking`: read "Ben says: ..." in Ben's words.
- `awaiting_answer`: collect final transcript for up to 60 seconds. End early after 8 seconds of silence once someone has spoken. Then call the stronger model to turn what was said into a short Slack reply for Ben. If nobody answered, tell Ben the team didn't respond yet.
- Don't raise a hand while Jarvis is speaking or answering a question. Wait.
- If the meeting ends with a relay still queued or in progress, tell the sender on Slack that it ended before the message was passed on.

### End of call

When Recall reports the call ended (or the bot was removed):

1. Flush the remaining transcript to Moss and mark the meeting `ended`. If the bot failed before it got into the call, or was cancelled before joining, mark it `failed` with the reason instead.
2. Generate notes and a short title with the stronger model, using the full transcript, the final board (goal, topics and their outcomes, notes), answers and the relay log, following the meeting notes instructions.
3. Post to the Slack channel. Save in Convex. Add to Moss.
4. Propose project-state changes with the stronger model: compare the current facts with the notes, the board's decisions and actions, and the topic outcomes. At most 8 add, update or remove proposals, durable facts only. Save them as pending and reply in the notes thread on Slack if there are any.

### Avatar

A simple drawn face or orb, not a photo. States:

- **Listening:** calm, slow pulse.
- **Thinking:** animated dots.
- **Hand raised:** a hand icon and the preview line underneath.
- **Speaking:** mouth or ring moves with the audio level of the playing audio.

## 11. Data model (Convex)

A starting point. The coding agent can adjust names.

The source of truth is `web/convex/schema.ts`. Everything hangs off an agent. Deleting an agent deletes its team, documents, meetings and project state (in scheduled cleanup batches), and its Moss index.

- **agents:** name, description, slackChannelId, behaviourInstructions, postMeetingInstructions, mossIndexName, memberCount, meetingCount, createdAt
- **teamMembers:** agentId, name, slackUserId (unique per agent), avatarUrl
- **documents:** agentId, fileName, storageId, contentType, size, status (`indexing`, `ready`, `failed`), error, mossDocIds, uploadedAt
- **meetings:** agentId, meetUrl, recallBotId, title, goal, status (`joining`, `live`, `ended`, `failed`), error, mossDocIds, startedAt, endedAt. At most one meeting per agent can be `joining` or `live`.
- **webhookEvents:** eventId, createdAt. Recall webhook IDs already handled, pruned after a week by a cron.
- **transcriptSegments:** meetingId, speaker, text, startTime, isFinal
- **boardTopics:** meetingId, title, status (`upcoming`, `active`, `done`, `dropped`), outcome, createdAt, updatedAt
- **boardNotes:** meetingId, topicId, column (`decisions`, `questions`, `actions`, `answers`; `topics` on old boards only), text, owner, sourceUrl, createdAt, updatedAt
- **answers:** meetingId, askedBy, question, spokenAnswer, sourceUrl, toolLog, createdAt
- **relayRequests:** meetingId, fromSlackUserId, fromName, message, preview, status, teamAnswer, slackReply, createdAt, updatedAt
- **avatarState:** meetingId, state, preview
- **stateFacts:** agentId, text, sourceMeetingId, createdAt, updatedAt
- **stateProposals:** agentId, meetingId, kind (`add`, `update`, `remove`), text, factId, previousText, status (`pending`, `accepted`, `dismissed`), createdAt
- **meetingNotes:** meetingId, agentId, markdown, slackMessageTs, createdAt

## 12. Environment variables

`.env.example` at the repo root has the full list with comments.

Orchestrator (`orchestrator/.env`):

```
ORCHESTRATOR_SECRET
CONVEX_URL
PUBLIC_API_BASE_URL
BOT_PAGE_BASE_URL
PORT
RECALL_API_KEY
RECALL_REGION
RECALL_WEBHOOK_VERIFICATION_SECRET
RECALL_OUTPUT_MODE
ANTHROPIC_API_KEY
CARTESIA_API_KEY
CARTESIA_VOICE_ID
MOSS_PROJECT_ID
MOSS_PROJECT_KEY
CONTEXT_DEV_API_KEY
SLACK_BOT_TOKEN
SLACK_APP_TOKEN
```

Web app (`web/.env.local`, and the Vercel project): `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_ORCHESTRATOR_WS_URL`.

Convex deployment: `ORCHESTRATOR_URL`, `ORCHESTRATOR_SECRET`, `ANTHROPIC_API_KEY` (notes and proposals), `SLACK_BOT_TOKEN` (Team tab user list, posting notes).

Slack bot scopes: `chat:write`, `im:history`, `im:read`, `im:write`, `users:read`. Event: `message.im`.

## 13. Key assumptions

Ranked by how badly the demo suffers if they're wrong.

1. **The two-way relay is the moment judges remember.** If it doesn't land, Jarvis looks like another notetaker.
2. **Audio plays in Recall's browser.** If the bot page can't play sound, Jarvis can't talk. Test this on day one.
3. **The whiteboard stays readable.** Fixed columns, short notes and large text keep it clean.
4. **Web answers land in under 10 seconds.** The filler line covers the first few seconds. The tool time limit stops long searches.
5. **Voice triggers work reliably.** "Hey Jarvis" and "Go ahead, Jarvis" are caught, with no false triggers.
6. **The team tolerates a raised hand.** A preview plus a voice grant feels polite, not disruptive.
7. **The live demo survives the venue.** Meet, Recall, Slack and every API need a working network on stage.

## 14. Demo script

Total: about 3 minutes. Team members in the call follow a rehearsed script.

1. **Setup (15s).** Show the Agents page, open Jarvis. Flick through the Team tab (Ben is on it), the Memory tab (client brief uploaded) and the Instructions tab. Paste the Meet link in the header and click Send.
2. **Discussion (60s).** Jarvis joins and shares its screen. The team talks through an event plan, mentioning a $10k budget. The whiteboard fills up.
3. **Question (20s).** "Hey Jarvis, how much does it cost to rent the Palace of Fine Arts, and does it fit our budget?" Jarvis searches the web, answers out loud using the budget from the call, and an answer note appears on the board.
4. **Catch-up (20s).** Show Ben's phone. He asks what he missed and gets a summary in Slack.
5. **Relay (40s).** Ben sends his idea. Jarvis raises its hand. "Go ahead, Jarvis." The team answers. Ben's phone shows the reply.
6. **Wrap-up (20s).** End the call. Notes land in the Slack channel. On Jarvis's Meetings tab, open the meeting to show notes, board, relay log and transcript.

## 15. Success metrics

Measured in rehearsal and the final demo.

- The full demo runs end to end, live, with no restart, in at least 2 of 3 rehearsals and in the final demo.
- The avatar switches to thinking within 1 second of "Hey Jarvis".
- "Let me check" starts within 2 seconds of the end of the question.
- The full answer starts within 10 seconds of the end of the question, including web search.
- A whiteboard note appears within 20 seconds of the point being said.
- Ben's catch-up summary arrives in Slack within 15 seconds.
- A raised hand appears within 5 seconds of Ben's message.
- Jarvis starts speaking within 3 seconds of "Go ahead, Jarvis".
- The team's answer reaches Ben on Slack within 10 seconds of them finishing.
- Meeting notes reach Slack within 2 minutes of the call ending.
- Zero false wake-word triggers in the final demo.

## 16. Build order

Each step should work on its own before moving on.

1. Recall bot joins a Meet and the orchestrator logs the live transcript.
2. Bot page shows on Jarvis's screenshare. Plays a test sound through the bot.
3. Cartesia TTS: orchestrator speaks a sentence through the bot page.
4. Wake word plus a simple answer from the transcript only.
5. Convex schema. Board notes written by the whiteboard loop and drawn on the bot page.
6. Moss memory and web search added to answers.
7. Slack bot: catch-up and questions.
8. Relay flow with raised hand and grant.
9. End of call notes to Slack.
10. Dashboard P0: agents list, create agent, agent page header with "Send to a meeting", Team tab, document upload. Then P1 in order. Steps 1 to 9 can use one agent created by a seed script.

## 17. Non-goals

**Not in scope:**

- Zoom, Microsoft Teams, or any chat tool besides Slack
- Visible browsing on Jarvis's screen
- Action tasks: purchases, bookings, sending email
- Acting in anyone's personal accounts
- Jarvis speaking without being addressed or granted (except P2 item 3)
- Login and permissions. Anyone with the dashboard link can see and edit every agent.
- More than one agent in the same meeting
- Photoreal avatars or lip-sync
- Business model, pricing or billing

## 18. Submission checklist

- Public GitHub repo. No API keys or secrets committed.
- README covering: setup, architecture, and a section per sponsor saying exactly what that tool does in Jarvis. For Cartesia, list the features used and known limitations.
- 2-minute demo-first video (Cartesia asks for this). Open with the relay moment. Make a separate 3 to 5 minute cut only if we do Fetch.ai.
- Demo uses real web results, never hardcoded answers.
- Select every track in section 8 on Devpost.

## 19. Backup plan

- Phone hotspot in case venue Wi-Fi fails.
- A recorded video of a full run, ready to play.
- If web search fails on stage, Jarvis still answers from memory and the call.
