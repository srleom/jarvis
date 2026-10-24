# Jarvis

An AI teammate that joins your team's Google Meet calls and keeps the meeting on track. Built for Cal Hacks 13.0 for student organisation leadership teams (hackathon organisers, club exec boards).

In a call, Jarvis:

1. **Scribes the discussion onto a live whiteboard** that it screenshares: topics, decisions, open questions, action items and answers.
2. **Answers questions out loud.** Say "Hey Jarvis" and ask. It uses the call so far, the team's documents and a live web search.
3. **Connects the call to people who aren't in it.** A late teammate DMs Jarvis on Slack to catch up, or to send the team a message. Jarvis raises its hand, reads the message when the team says "Go ahead, Jarvis", and sends their answer back to Slack.

When the call ends, Jarvis posts notes to Slack. The web dashboard lists your agents, their team, memory, instructions and every meeting with notes, whiteboard, answers, relay log and transcript.

The full product spec is in [docs/APP_OVERVIEW.md](docs/APP_OVERVIEW.md).

## Architecture

```
            ┌──────────── Google Meet ────────────┐
            │  Recall.ai bot (screenshares the     │
            │  bot page, plays its audio)          │
            └──────┬───────────────────▲───────────┘
   transcript,     │                   │ create bot, chat, leave
   chat, status    ▼                   │
         ┌─────────────────────────────┴──┐   Claude · Cartesia · Moss · Bright Data
         │ orchestrator/ (Node, Express)  │──────────────────────────────────────▶
         │ wake word · Q&A · whiteboard   │◀── Slack (Bolt, Socket Mode) ──▶ DMs
         │ loop · relay · memory          │
         └──────┬───────────▲─────────┬───┘
     mutations  │           │ actions │ WebSocket (voice)
                ▼           │         ▼
         ┌──────────────────┴──┐   ┌──────────────────────────┐
         │ Convex (web/convex) │◀─▶│ web/ Next.js             │
         │ data · files · live │   │ dashboard + /bot/[id]    │
         │ sync · notes action │   │ (the screenshared page)  │
         └─────────────────────┘   └──────────────────────────┘
```

- **web/** – Next.js 16 dashboard and the bot page (`/bot/[meetingId]`, a fixed 1280×720 whiteboard with the avatar). Tailwind + shadcn/ui.
- **web/convex/** – Convex schema and functions. All data, file storage for documents, live sync to the dashboard and bot page, and the end-of-call notes action.
- **orchestrator/** – long-running Node server. Receives Recall's real-time webhooks, runs the wake word, Q&A, whiteboard loop and relay state machine, streams voice to the bot page, runs the Slack bot, and owns Moss (its SDK is a native module).

## Running it locally

Requirements: Node 20+, pnpm.

```bash
# 1. Web app + Convex (local backend, no account needed)
cd web
pnpm install
CONVEX_AGENT_MODE=anonymous npx convex dev      # keep running; writes web/.env.local
npx convex env set ORCHESTRATOR_SECRET "$(openssl rand -hex 24)"
npx convex env set ORCHESTRATOR_URL http://127.0.0.1:8787
npx convex run seed:demo                         # optional demo agent and meeting
pnpm dev                                         # http://localhost:3000

# 2. Orchestrator
cd ../orchestrator
pnpm install
cp ../.env.example .env                          # fill in keys; ORCHESTRATOR_SECRET must match Convex
pnpm dev                                         # http://localhost:8787/health shows what's missing
```

To use a Convex cloud project instead, run `npx convex dev` (it asks you to log in) and set the same env vars on that deployment.

### Putting it in a real call

Recall's bot runs in the cloud, so the bot page, the orchestrator and Convex must all be reachable from the internet (it blocks `localhost`). The setup we use:

- **Convex:** a cloud dev deployment (`npx convex dev`, logged in). Set `ORCHESTRATOR_URL` on it to the orchestrator's public URL.
- **Web app:** deployed to Vercel from `web/` with `npx vercel deploy --prod`. The Vercel project needs `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_ORCHESTRATOR_WS_URL` (`wss://<orchestrator public host>`). These are baked in at build time, so redeploy after changing them. Point `BOT_PAGE_BASE_URL` at the production URL (production domains aren't behind Vercel's login wall; per-deployment preview URLs are).
- **Orchestrator:** runs locally behind a static ngrok domain (`ngrok http 8787`) → `PUBLIC_API_BASE_URL`, with `CONVEX_URL` set to the cloud deployment.

Recall also needs a verified webhook endpoint (see [Recall webhooks and calendar](#recall-webhooks-and-calendar)). Without it, the orchestrator still polls bot status every 10 seconds, but calendar scheduling needs the webhook.

Then create an agent, add your team, upload a brief, paste a Meet link and click Send. Admit Jarvis from the lobby.

### Recall webhooks and calendar

Meeting bots reach calls two ways. Both end up in the same meeting flow (whiteboard, answers, relay, notes):

| Path | Use it for |
|---|---|
| **Calendar** (production) | Link a Google Calendar to an agent on its Settings tab. Jarvis joins every future Google Meet event on that calendar. |
| **Pasted link** ("Send to a meeting now") | Testing, or a one-off call that isn't on a calendar. |

**Calendar rule.** With `CALENDAR_OPT_IN=all` (the default) Jarvis joins *every* future Meet event on the linked calendar, so only link a calendar whose events you are happy to have recorded. Add `[nojarvis]` to an event title or description to skip it, or decline the event. Set `CALENDAR_OPT_IN=tagged` to join only events containing `[jarvis]`. Jarvis announces itself in the call and chat when it joins. Events that already ended, were deleted, or have no Google Meet link are skipped, as are events that overlap another meeting for the same agent.

**Backend settings** (orchestrator only, never the browser): `RECALL_API_KEY`, `RECALL_REGION=us-west-2`, `RECALL_WEBHOOK_VERIFICATION_SECRET`, `PUBLIC_API_BASE_URL`.

**Webhook endpoint.** In the Recall dashboard (US West) add `https://<PUBLIC_API_BASE_URL host>/recall/webhooks` subscribed to `bot.joining_call`, `bot.in_waiting_room`, `bot.in_call_recording`, `bot.call_ended`, `bot.done`, `bot.fatal`, `calendar.sync_events` and `calendar.update`. Every request is verified against the raw body with the workspace verification secret, de-duplicated by message id in Convex, and acknowledged before processing. In-call transcript and chat events go to `/recall/realtime/`, which each bot is told about when it is created. No secret ever appears in a URL.

**Reliability notes.** Retried webhooks are processed once. A missed calendar webhook is repaired by a re-sync of every linked calendar every 10 minutes. Recall API calls honour `Retry-After` and back off on 429/503/507; a create is never retried after an ambiguous connection failure, and before creating a bot the orchestrator checks whether Recall already holds one for that meeting.

**Tests.** `cd orchestrator && pnpm test` (signature verification, Recall client retries, calendar rules, webhook idempotency over real HTTP) and `pnpm smoke` (boots the HTTP app with fake settings and makes real loopback requests).

### Trying the live flows without a call

```bash
cd web && npx convex run seed:liveMeeting '{"agentId":"<agent id>"}'
cd ../orchestrator && pnpm simulate <meetingId>
```

This posts signed fake Recall transcript events (it needs the same `RECALL_WEBHOOK_VERIFICATION_SECRET` as the server) (including a "Hey Jarvis" question) to the orchestrator. Open `http://localhost:3000/bot/<meetingId>` to watch the board and avatar.

## How each sponsor tool is used

### Convex
The whole backend. Every table (agents, team, documents, meetings, transcript, board notes, answers, relay requests, avatar state, notes) lives in Convex. The dashboard and the bot page subscribe with `useQuery`, so whiteboard notes, the raised hand and the transcript update live with no polling. Uploaded documents go to Convex file storage. Meeting notes are generated by a Convex action (`notes.generate`) scheduled when the call ends, which posts to Slack and saves the notes. Deleting an agent or meeting cascades through scheduled cleanup mutations.

### Cartesia
Jarvis's whole voice is Cartesia Sonic (`sonic-3.6` via `POST /tts/bytes`, 24 kHz 16-bit WAV). It speaks the join notice, the "Let me check." filler (cached after first use), every answer, and Ben's relayed message ("Ben says: …"). Audio is streamed from the orchestrator to the bot page over a WebSocket and played with the Web Audio API; an analyser node drives the avatar's speaking ring from the real audio level. The Cartesia key never leaves the server.

Known limitations:
- We use the bytes endpoint, so playback starts after the whole clip is synthesised (fine for one to three sentences; streaming would cut first-audio latency further).
- If no bot page is connected or synthesis fails, Jarvis falls back to posting the text in Meet chat.
- English only.

### Moss
Moss is Jarvis's memory search, queried mid-conversation. There is one Moss index per agent. It holds uploaded documents (≈500-word chunks), the live transcript (≈200-word chunks added every 30 seconds) and meeting notes. During a call, Claude calls `search_memory`, which runs a Moss query and returns the top 5 chunks with their source. The dashboard's Memory tab runs the same search. Deleting a document or meeting removes its chunks from Moss.

### Bright Data
Web answers. `web_search` calls the SERP API (Google, parsed JSON via `brd_json=1`) and returns the top 5 results; `read_page` calls Web Unlocker with `data_format: markdown` and returns the first 4,000 characters. Blocks, timeouts and empty results are handled: the tool tells Claude to try another result, and if search fails Jarvis says it couldn't confirm online. Every call is logged with query, status and time taken, and shown under each answer on the meeting page. Answers always show their source domain on the whiteboard. No mocked data.

### Anthropic (Claude)
All reasoning. `claude-haiku-5-5` handles the whiteboard loop (every 15 s it returns at most three add/update/move/remove operations), DM classification and raised-hand previews. `claude-sonnet-5-5` answers spoken questions (with up to 4 tool calls in an 8-second tool budget), writes Slack catch-ups and relay replies, and writes meeting notes. Every state-changing call returns JSON validated with zod; on failure it retries once, then skips.

Where it could go wrong, and what we do about it:
- **False wake words.** Jarvis only reacts to "hey/hi/ok <name>" or "<name>," at the start of an utterance, ignores itself, and never speaks unless addressed or granted.
- **Hallucinated facts.** Answers must cite a source when they come from the web, and the prompt forbids guessing when search fails.
- **Interruptions.** Relay messages are never read without a grant ("Go ahead, Jarvis" or "go" in chat); "Not now, Jarvis" keeps the hand up.

## Responsible use
- On joining, Jarvis says out loud and posts (pinned) in chat that it is transcribing and how to remove it.
- Each agent only talks to people on its Team tab; anyone else gets a polite refusal.
- Meetings and their transcripts can be deleted from the dashboard, which also removes them from Moss.
- The whiteboard is a live visual record that helps teammates who are hard of hearing or joining late.
