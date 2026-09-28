# Bubloo Control Center

A voice-first AI operating system. Talk naturally with Jarvis — it connects to your real services (Gmail, Google Calendar, Notion), performs actions, remembers context, and continuously updates a live dashboard while it works. Full-duplex conversation with natural interruption, synchronized across every open window.

## Architecture

- **Next.js (App Router)** — UI plus a route handler (`src/app/api/realtime/token`) that mints ephemeral OpenAI Realtime tokens so the real API key never reaches the browser.
- **OpenAI Realtime API** (`gpt-realtime`, WebRTC) — speech-to-speech with semantic VAD, barge-in interruption, and function calling over the data channel.
- **Convex** — the shared brain. Transcript, memory, timeline, dashboard cards, connections, and the current objective are all reactive queries, so every open tab stays in sync automatically.
- **Composio** — real OAuth integrations. Jarvis creates managed auth configs and hosted sign-in links on demand, then executes Gmail / Calendar / Notion tools server-side in Convex actions.
- **Convex Auth** — email + password authentication. Every table (todos, memory, transcript, timeline, connections, dashboard) is scoped per user, and Composio connections are keyed by the Convex user id, so each operator has a fully isolated Jarvis. The Realtime token route rejects unauthenticated requests.

```
Browser ──WebRTC audio + data channel──▶ OpenAI Realtime
   │                                          │
   │  function calls                          │
   ▼                                          │
Convex action (tool dispatcher) ──▶ Composio ─┘
   │
   └─▶ writes memory / timeline / dashboard / objective
         └─▶ reactive queries update every open tab
```

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment** — copy `.env.example` to `.env.local` and fill in:
   - `OPENAI_API_KEY` — OpenAI key with Realtime access
   - Convex vars are written automatically by `npx convex dev`

   Set the required env vars on the Convex deployment:

   ```bash
   npx convex env set COMPOSIO_API_KEY <your-key>
   npx convex env set SITE_URL http://localhost:3000
   # JWT keys for Convex Auth (generate once):
   #   JWT_PRIVATE_KEY — RS256 private key (PKCS8, newlines as spaces)
   #   JWKS — matching public JWKS JSON
   ```

3. **Run** (two processes):

   ```bash
   npx convex dev     # Convex backend (local anonymous deployment works)
   npm run dev        # Next.js on http://localhost:3000
   ```

4. Open http://localhost:3000, create an operator account (email + password), click **Activate Jarvis**, grant microphone access, and speak.

## Things to try

- "What can you connect to?"
- "Connect my Gmail." — complete the sign-in popup, Jarvis confirms when it's linked
- "Check my unread emails."
- "What meetings do I have today?"
- "Create a meeting tomorrow at 2 PM called design review."
- "Remember that my favorite editor is Cursor."
- "What do you know about me?"
- "Track a task: ship the landing page."
- "Jarvis, prepare me for today." — the flagship daily briefing
- Interrupt Jarvis mid-sentence — it stops and pivots immediately
- Open a second tab — conversation, memory, timeline, and dashboard mirror in real time
