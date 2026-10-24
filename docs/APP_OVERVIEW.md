# Jarvis - App Overview

For Cal Hacks 13.0. This document is the build spec for the MVP. Section 9 onward is written for the coding agent.

## 1. What it is

Jarvis is an AI teammate that joins your team's Google Meet calls and keeps the meeting on track.

During a call it does three things:

1. **Scribes the discussion onto a live whiteboard.** Jarvis shares its screen. Topics, decisions, open questions and action items appear as sticky notes as the team talks.
2. **Answers questions out loud.** Someone says "Hey Jarvis" and asks a question. Jarvis uses what's been said in the call, the team's documents and a web search to answer.
3. **Connects the call to people who aren't in it.** A late teammate DMs Jarvis on Slack. Jarvis catches them up without interrupting anyone. If they want to tell the team something, Jarvis raises its hand, reads the message when the team is ready, and sends the team's answer back to Slack.

When the call ends, Jarvis posts meeting notes to Slack. A web dashboard lists all your agents. Each agent has its own page with its team, memory, custom instructions, and every meeting it has joined with its notes.

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

- One card per agent: name, number of team members, number of meetings, and status ("In a meeting" or "Idle").
- A "New agent" button. It asks for a name and a Slack channel, creates the agent, and opens its page.

**Agent page**

The header shows the agent's name and status, plus a "Send to a meeting" box: paste a Google Meet link, click Send. If the agent is already in a meeting, the box shows a link to that meeting instead. An agent can only be in one meeting at a time.

Below the header are five tabs:

- **Meetings.** Every meeting this agent has joined, newest first. Each row shows a title (generated from the notes), date, duration, and a "Live" badge if it's in progress. Clicking a row opens the meeting detail page:
  - The notes (same as the Slack post)
  - The final whiteboard (or the live whiteboard if the meeting is in progress)
  - Questions Jarvis answered, with sources
  - The relay log: who asked what, and what the team answered
  - The full transcript with speaker names
  - A delete button, which also removes the meeting from memory
- **Team.** The people who can use this agent. Each member has a name and a Slack account. Add a member by picking from the Slack workspace's user list. Remove with one click. Only team members can DM this agent for a catch-up, a question or a relay.
- **Memory.** What this agent knows:
  - Context documents: upload (PDF, Markdown or text) and delete
  - Past meeting notes it can draw on
  - A search box that runs the same memory search Jarvis uses, so you can see what it would find
- **Instructions.** Two text boxes:
  - **Behaviour instructions.** Added to every prompt. Example: "Keep answers under 20 seconds. Prices in USD."
  - **Post-meeting instructions.** Controls what goes into the meeting notes. Default: "Summary, decisions, action items by owner."
- **Settings.** Rename the agent, change its Slack channel, delete the agent.

**What's P0 and what's P1**

- **P0 (P0-1 below):** the agents list, creating an agent, the agent page header with "Send to a meeting", the Team tab, and document upload in the Memory tab. The live flows need these to work.
- **P1, in this order:** the Meetings tab and meeting detail page (P1-1), the rest of the Memory tab (P1-2), the Instructions tab (P1-3). The Settings tab comes last.

### P0-1. Create an agent and send it to a meeting

1. On the Agents page, click "New agent". Enter a name (default "Jarvis") and a Slack channel for meeting notes.
2. On the agent's page, add team members on the Team tab.
3. Upload context documents on the Memory tab, for example the client brief.
4. Paste a Google Meet link in the header and click Send.

The agent's name is also its wake word. An agent named "Nova" answers to "Hey Nova". The rest of this document uses "Jarvis".

### P0-2. Jarvis joins the call

- Jarvis joins the Meet as a named participant. Someone in the call admits it.
- On joining, Jarvis says once, out loud and in chat: "Hi, I'm Jarvis. I'm transcribing this meeting and taking notes. Say 'Hey Jarvis' to ask me something, or remove me from the call to stop."
- Jarvis shares its screen. The screen shows the whiteboard with a small avatar in the bottom-right corner.
- The avatar has four states: listening, thinking, hand raised, speaking.
- Everything said is transcribed with speaker names and stored.

### P0-3. Live whiteboard

The whiteboard has a fixed layout of five columns:

- Topics
- Decisions
- Open questions
- Action items (each note shows an owner)
- Answers (Jarvis's answers to questions, with the source)

Every 15 seconds, Jarvis looks at the new transcript since the last update and the current board. It returns small changes: add a note, edit a note, move a note to another column, or remove a note. If nothing changed, it returns no changes.

Notes are short, under 12 words. The model never chooses positions. The page lays out notes in their column, top to bottom, in the order they were created.

Example: someone says "Let's go with the Palace of Fine Arts if it's under 10k." A note "Palace of Fine Arts, if under $10k" appears under Open questions. A minute later the team confirms. The note moves to Decisions.

### P0-4. Ask Jarvis

Someone says "Hey Jarvis, how much does it cost to rent the Palace of Fine Arts, and does it fit our budget?"

1. Within 1 second of "Hey Jarvis", the avatar switches to thinking.
2. When the person finishes the question, Jarvis says a short filler out loud: "Let me check."
3. Jarvis decides what it needs. It can use any of these:
   - **The call so far** (recent transcript, always included)
   - **Memory** (context documents, earlier parts of this call, past meeting notes)
   - **Web search** (search results, then read the top page if the snippets aren't enough)
4. Jarvis answers out loud in one to three sentences. In this example it finds the rental price on the web and the budget in the call ("you said 10k earlier").
5. An answer note appears in the Answers column, with the source domain (for example "palaceoffinearts.com").

If the web search fails or takes too long, Jarvis answers from what it has and says it couldn't confirm online.

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
6. If someone says "Not now, Jarvis", the hand stays raised until the team says go.

Only one hand can be raised at a time. Extra relay requests wait in a queue.

### P0-7. Meeting notes

When the call ends, Jarvis posts to the Slack channel:

- Summary
- Decisions
- Action items by owner
- Questions Jarvis answered, with sources

The notes are also saved under the meeting on the agent's Meetings tab (P1-1).

### P1-1. Meetings tab and meeting detail

As described in "Dashboard structure": the agent's meetings, newest first, each opening to its notes, whiteboard, answers, relay log and transcript.

### P1-2. Memory tab

As described in "Dashboard structure": documents, past meeting notes, and the memory search box. (Document upload alone is P0.)

### P1-3. Instructions tab

As described in "Dashboard structure": behaviour instructions and post-meeting instructions. Until this is built, use the defaults.

### P2 (only if time)

1. **Jarvis on ASI:One (Fetch.ai).** A second way for an absent teammate to reach Jarvis, alongside Slack. A uAgent registered on Agentverse that supports catch-up and relay inside an ASI:One conversation. See section 8 for the rules it must meet.
2. Ask Jarvis on Slack days later: "What did we decide about the venue?" (this mostly works already once past notes are in memory).
3. Jarvis raises its hand on its own when it notices something useful, at most once every 5 minutes.

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

Based on the Cal Hacks 13.0 prize page (updated Oct 23). Every sponsor tool must do a real job in the working product. Several tracks disqualify or mark down tools that are only mentioned in the README.

### Tracks we build for

| Track                            | Prize                       | How Jarvis qualifies                                                                                                                                              | What the rules ask for                                                                                                                                                                                                                                  |
| -------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Best use of Convex**           | $5,000                      | Convex is the backend: all data, live sync to the whiteboard and dashboard, file storage for documents, scheduled jobs for the whiteboard loop and meeting notes. | Meaningful use. No other written rules.                                                                                                                                                                                                                 |
| **Best Use of Cartesia**         | Meta glasses (TBD)          | Jarvis's whole voice is Cartesia Sonic. Voice is how the team talks to Jarvis and how Ben's message reaches the room.                                             | Voice must be core. 2-minute demo-first presentation. README listing Cartesia features used and known limitations. No keys in the repo. Judged 25% each on problem, use of Cartesia, execution, and impact and responsibility (accessibility, privacy). |
| **Best Use of Moss**             | AirPods Max/Pro             | Moss is Jarvis's memory search, queried mid-conversation. Fits their "Voice AI" example exactly.                                                                  | Voice agents that listen, respond and act in real time.                                                                                                                                                                                                 |
| **Bright Data: Public Web Data** | Up to $1,500 credits + $500 | Web search (SERP API) plus reading the result page (Web Unlocker) for live answers.                                                                               | Must be essential to the product. Must handle blocks, slow responses and empty results. Real results only, no mocked or hardcoded data in the demo. No scraping behind logins.                                                                          |
| **Anthropic**                    | TBD                         | Claude does all reasoning.                                                                                                                                        | A named community, a real problem, one thing that works well, and thoughtful use of Claude including where it could go wrong.                                                                                                                           |

### Tracks we submit to with no extra build

| Track                                                      | Why it fits                                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Microsoft Grand Prize: Built for the Real World**        | A production-minded productivity agent. Judged on customer understanding, measurable usefulness, path to production, responsible design and end-to-end function. |
| **Meta: Bringing People Closer Together with AI**          | The relay keeps absent teammates connected to their team in real time.                                                                                           |
| **Cal Hacks: Most Technically Complex, Best People-First** | General tracks.                                                                                                                                                  |

### Optional (P2)

| Track                               | Prize                | What it would take                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Best Use of Fetch.ai**            | $1,250 / $750 / $500 | A uAgent registered on Agentverse, implementing the Agent Chat Protocol, discoverable on ASI:One. The primary workflow must be completable entirely inside an ASI:One conversation. For Jarvis: catch-up and relay from ASI:One instead of Slack. Also needs a public repo, the Innovation Lab badges in the README, a 3 to 5 minute video, and registration through their ASI:One submission agent. About half a day of work. |
| **Creao AI: Best Team Empowerment** | Share of $1,000      | Rules are in a Google Doc that needs sign-in. Read it before deciding. It may require building with Creao.                                                                                                                                                                                                                                                                                                                     |

### Considered and skipped

- **Cartesia Ink (speech-to-text):** Recall's own transcript labels speakers, which we need for action item owners. Ink would mean pulling each speaker's raw audio from Recall and streaming it to Ink ourselves.
- **Apify and Context.dev:** overlap with Bright Data. One web provider keeps the code simple. Bright Data's SERP API returns in under a second, which matters for a voice answer.
- **Spacetime:** a realtime backend that competes with Convex. Convex has the bigger prize and covers more of what we need.
- **ElevenLabs:** competes with Cartesia.
- **Factory Droid SDK:** the prize needs Droid doing real work inside the running product, not just writing our code. No natural place for it in Jarvis.
- **Atlassian:** requires building a Forge app inside Jira or Confluence. Too far from the core product.
- **Mana:** only rewards using Mana while building. Fine to use as a build tool, but not part of the product.
- **Not relevant:** Notability, Capital One, Coinbase, CRS, Hyphenate, Bitdeer AI, Visa, SpaceXAI, Figma, Elastic (rules not posted yet), the MLH database and cloud tracks.

### Responsible use (for Cartesia, Anthropic and Microsoft judging)

- When Jarvis joins, it says out loud and in chat that it is transcribing the meeting, and how to remove it.
- Jarvis only speaks when addressed or granted. It never reads a relay message without a grant.
- Each agent only talks to people on its Team tab. A DM from anyone else gets a polite refusal.
- The dashboard can delete a meeting and its transcript, which also removes it from Moss.
- The whiteboard doubles as a live visual record of the meeting, which helps teammates who are hard of hearing or joining late.
- Web answers always show their source on the board, so the team can check them.

## 9. Architecture

### Components

1. **Dashboard** (Next.js, React). Agents list and agent pages (see "Dashboard structure" in section 5). Reads and writes Convex. Routes: `/` (agents), `/agents/[agentId]` (agent page, tab in the query string), `/agents/[agentId]/meetings/[meetingId]` (meeting detail).
2. **Bot page** (one route of the same Next.js app, for example `/bot/[meetingId]`). This is the page Recall renders as Jarvis's screenshare. It shows the tldraw whiteboard and the avatar, and plays Jarvis's voice.
3. **Orchestrator** (Node.js, TypeScript, long-running server). The brain. Receives Recall's live transcript and chat events, runs the wake word, whiteboard loop and Q&A, calls Claude, Cartesia, Moss and Bright Data, and runs the Slack bot.
4. **Convex.** Stores everything. The dashboard and the bot page subscribe to it, so changes show up live. Uploaded documents go in Convex file storage. Meeting notes generation runs as a Convex action triggered by the end-of-call event. Use Convex for anything that doesn't need a long-lived connection, since Convex is a prize track.

The orchestrator must be reachable from the public internet so Recall can send it events. Host it on a service like Railway or Fly.io, or use ngrok during development.

### External services

| Service     | Purpose                                                         |
| ----------- | --------------------------------------------------------------- |
| Recall.ai   | Puts the bot in Google Meet, live transcript, chat, screenshare |
| Claude API  | All reasoning (see "Models" below)                              |
| Cartesia    | Text-to-speech                                                  |
| Moss        | Memory search                                                   |
| Bright Data | Web search and page reading                                     |
| Slack       | Bot DMs and channel posts                                       |
| Convex      | Database and live sync                                          |

### How the pieces talk

- **Recall to orchestrator:** live transcript (partial and final, with speaker name), chat messages, and bot status changes (joined, call ended), sent to the orchestrator's endpoints.
- **Orchestrator to Recall:** create bot, send a chat message, remove bot.
- **Orchestrator to Convex:** writes transcript segments, board notes, answers, relay requests, avatar state, meeting notes.
- **Convex to bot page:** the page subscribes to board notes and avatar state for its meeting, and redraws when they change.
- **Orchestrator to bot page (audio):** a WebSocket. The orchestrator streams Cartesia audio to the page, and the page plays it. Audio does not go through Convex.
- **Slack to orchestrator:** Slack Bolt in Socket Mode, so Slack needs no public URL.

### Key technical constraints

- **Voice must play inside the bot page.** Recall does not allow its separate audio output endpoint while a webpage is being streamed. The page plays audio with the Web Audio API. Test early that audio plays in Recall's browser without a user click.
- **Use screenshare, not camera,** for the bot page, so the whiteboard is readable. Check the exact Recall output media field for screenshare in their docs. Fall back to camera if screenshare doesn't work in Meet.
- **Page size is 1280x720.** Design the board for that. Minimum note text size 20px.
- **Keep the Cartesia key on the server.** The page never calls Cartesia directly.
- **Google Meet admission.** The bot waits in the lobby until someone admits it. That's fine for the demo.
- **Check Recall's current docs** for exact field and event names before coding. Don't guess them.

### Models

Use Claude for all reasoning. Check current model names on Anthropic's docs before coding.

- **Fast model (Haiku class):** whiteboard updates, wake word follow-up, deciding what a Slack DM wants, spotting "go ahead" and "not now".
- **Stronger model (Sonnet class):** answers to questions, catch-up summaries, relaying the team's answer, meeting notes.

All Claude calls that change state return JSON validated against a schema (zod). If validation fails, retry once, then skip.

## 10. Detailed behaviour

### Wake word

- Watch partial transcripts for "hey <agent name>" (lowercase, punctuation stripped). Also accept "hi <agent name>" and "<agent name>," at the start of an utterance. The same goes for "go ahead <agent name>" and "not now <agent name>" below.
- On a match, set the avatar to thinking right away.
- Wait for the final transcript of that utterance. The question is the text after the wake word.
- If the final transcript has no question (just "Hey Jarvis"), wait up to 5 more seconds for the next final utterance from the same speaker.
- Ignore the wake word while Jarvis is speaking.

### Answering a question

1. Speak "Let me check." immediately (Cartesia, cached audio is fine).
2. Call the stronger model with:
   - Behaviour instructions (P1-3)
   - The last 5 minutes of transcript
   - The question and who asked it
   - Tools: `search_memory(query)`, `web_search(query)`, `read_page(url)`
3. Tool behaviour:
   - `search_memory` queries Moss and returns the top 5 chunks with their source.
   - `web_search` calls Bright Data SERP and returns the top 5 results (title, URL, snippet).
   - `read_page` calls Bright Data Web Unlocker, converts to text, and returns the first 4,000 characters.
4. Hard limits: at most 4 tool calls, 8 seconds total for tools. When time is up, answer with what's available.
   - If a page is blocked or times out, try the next search result.
   - If search returns nothing, say so out loud rather than guessing.
   - Log every web call (query, status, time taken) so the README and demo can show real results.
5. Output JSON: `{ spoken_answer, board_note, source_url }`. `spoken_answer` is one to three sentences.
6. Speak the answer. Add `board_note` to the Answers column. Save the answer.

### Whiteboard loop

- Every 15 seconds while the call is live, if there are new final transcript segments:
- Call the fast model with the current board (id, column, text, owner) and the new segments.
- It returns a list of operations:
  - `add { column, text, owner? }`
  - `update { id, text?, owner? }`
  - `move { id, column }`
  - `remove { id }`
- Rules in the prompt: at most 3 operations per update; don't duplicate an existing note; move a note rather than adding a new one when something gets decided; action items need an owner if one was named.
- Apply the operations in one Convex mutation.

### Memory (Moss)

- One Moss index per agent.
- When a context document is uploaded, split it into chunks of about 500 words and add them. Metadata: source "doc", file name.
- Every 30 seconds during a call, add new transcript text in chunks of about 200 words. Metadata: source "transcript", meeting ID, speakers, time.
- When meeting notes are generated, add them. Metadata: source "notes", meeting ID, date.

### Slack DMs

There is one Slack bot for all agents. When someone DMs it, pick the agent first:

1. Find the agents whose Team tab includes the sender. If none, reply politely that they aren't on any agent's team.
2. If exactly one of those agents is in a live meeting, use it.
3. If several are live, ask which one, listing their names. Use the sender's next reply to choose.
4. If none are live, use the agent with the most recent meeting.

Replies come from the bot and start with the agent's name when it isn't "Jarvis", for example "Nova: here's what you missed".

Then classify the DM with the fast model into one of:

- `catch_up`: "What have I missed?" Reply with a summary of the current call (or the most recent call if none is live).
- `question`: a question about the call or past meetings. Answer in Slack using memory. Never interrupt the call.
- `relay`: a message for the team. Start the relay flow (P0-6).
- `other`: reply briefly and explain what Jarvis can do.

If there's no live call and the DM is a relay, tell the sender there's no meeting running.

### Raised hand and grant

State machine for a relay request: `queued` then `hand_raised` then `speaking` then `awaiting_answer` then `answered` (or `expired`).

- `hand_raised`: avatar shows the hand and preview. Post the preview in Meet chat via Recall.
- Grant: a final transcript containing "go ahead jarvis" (or "go ahead, jarvis"), or a chat message that is exactly "go".
- Defer: "not now jarvis". Stay in `hand_raised`.
- `speaking`: read "Ben says: ..." in Ben's words.
- `awaiting_answer`: collect final transcript for up to 60 seconds. End early after 8 seconds of silence once someone has spoken. Then call the stronger model to turn what was said into a short Slack reply for Ben. If nobody answered, tell Ben the team didn't respond yet.
- Don't raise a hand while Jarvis is speaking or answering a question. Wait.

### End of call

When Recall reports the call ended (or the bot was removed):

1. Generate notes with the stronger model, using the full transcript, the final board, answers and the relay log, following the post-meeting instructions.
2. Post to the Slack channel.
3. Save in Convex. Add to Moss.

### Avatar

A simple drawn face or orb, not a photo. States:

- **Listening:** calm, slow pulse.
- **Thinking:** animated dots.
- **Hand raised:** a hand icon and the preview line underneath.
- **Speaking:** mouth or ring moves with the audio level of the playing audio.

## 11. Data model (Convex)

A starting point. The coding agent can adjust names.

Everything hangs off an agent. Deleting an agent deletes its team, documents and meetings, and its Moss index.

- **agents:** name, slackChannelId, behaviourInstructions, postMeetingInstructions, mossIndexName, createdAt
- **teamMembers:** agentId, name, slackUserId (unique per agent)
- **documents:** agentId, fileName, storageId, uploadedAt
- **meetings:** agentId, meetUrl, recallBotId, title, status (`joining`, `live`, `ended`), startedAt, endedAt. At most one meeting per agent can be `joining` or `live`.
- **transcriptSegments:** meetingId, speaker, text, startTime, isFinal
- **boardNotes:** meetingId, column, text, owner, sourceUrl, createdAt, updatedAt
- **answers:** meetingId, askedBy, question, spokenAnswer, sourceUrl, createdAt
- **relayRequests:** meetingId, fromSlackUserId, fromName, message, preview, status, teamAnswer, createdAt
- **avatarState:** meetingId, state, preview
- **meetingNotes:** meetingId, markdown, slackMessageTs, createdAt

## 12. Environment variables

```
RECALL_API_KEY
RECALL_REGION
ANTHROPIC_API_KEY
CARTESIA_API_KEY
CARTESIA_VOICE_ID
MOSS_PROJECT_ID
MOSS_PROJECT_KEY
BRIGHT_DATA_API_KEY
BRIGHT_DATA_SERP_ZONE
BRIGHT_DATA_UNLOCKER_ZONE
SLACK_BOT_TOKEN
SLACK_APP_TOKEN
CONVEX_URL
CONVEX_DEPLOY_KEY
ORCHESTRATOR_PUBLIC_URL
BOT_PAGE_BASE_URL
```

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
6. Moss memory and Bright Data web search added to answers.
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
- Jarvis speaking without being addressed or granted (except P2-4)
- Login and permissions. Anyone with the dashboard link can see and edit every agent.
- More than one agent in the same meeting
- Photoreal avatars or lip-sync
- Business model, pricing or billing

## 18. Submission checklist

- Public GitHub repo. No API keys or secrets committed.
- README covering: setup, architecture, and a section per sponsor saying exactly what that tool does in Jarvis. For Cartesia, list the features used and known limitations.
- 2-minute demo-first video (Cartesia asks for this). Open with the relay moment. Make a separate 3 to 5 minute cut only if we do Fetch.ai.
- Demo uses real web results, never hardcoded answers (Bright Data disqualifies mocked data).
- Select every track in section 8 on Devpost.

## 19. Backup plan

- Phone hotspot in case venue Wi-Fi fails.
- A recorded video of a full run, ready to play.
- If web search fails on stage, Jarvis still answers from memory and the call.
