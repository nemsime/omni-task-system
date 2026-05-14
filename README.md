# Omni Task System

A production-ready task manager that takes Telegram text **or voice** messages and turns them into tasks on a realtime Kanban dashboard. Voice messages are transcribed by OpenAI Whisper. All async work (transcription, bot notifications) flows through Redis-backed BullMQ queues, and live UI updates stream over Socket.IO.

## Architecture

```
                     ┌─────────────────────┐
                     │      Telegram        │
                     │  text / voice notes  │
                     └──────────┬───────────┘
                                │ webhook / long-poll
                                ▼
   ┌────────────────────────────────────────────────────┐
   │              backend  (Express + Telegraf)          │
   │  /tasks REST  •  /telegram/webhook  •  Socket.IO   │
   │  • text task → DB, emit task:created               │
   │  • voice file → enqueue voice-processing           │
   └──────┬───────────────────┬────────────────────┬────┘
          │ Prisma            │ BullMQ             │ Socket.IO
          ▼                   ▼                    ▼
   ┌──────────────┐    ┌──────────────┐    ┌────────────────┐
   │  PostgreSQL  │    │    Redis     │    │   frontend     │
   │  Users +     │    │ voice-proc.  │    │  React+Vite    │
   │  Tasks       │    │ bot-notif.   │    │  Kanban + DnD  │
   └──────────────┘    └──┬───────────┘    └────────────────┘
                          │ consume
                          ▼
              ┌────────────────────────────┐
              │   worker  (BullMQ worker)   │
              │  • download voice file      │
              │  • OpenAI Whisper           │
              │  • POST /tasks back         │
              │  • enqueue bot-notif. for   │
              │    transcript + task card   │
              └────────────────────────────┘
```

## Quick start (Docker)

Requires Docker, a Telegram bot token from [@BotFather](https://t.me/BotFather), and an OpenAI API key.

```bash
cp .env.example .env
# fill in BOT_TOKEN and OPENAI_API_KEY

docker compose up --build
```

Services:

| Service | URL | Purpose |
|---|---|---|
| frontend | http://localhost:8080 | Kanban dashboard |
| backend | http://localhost:5000 | REST API + Telegram bot |
| postgres | localhost:5432 | task storage |
| redis | (internal only) | BullMQ broker |
| worker | – | voice transcription |

To use the dashboard, message your bot `/myid` and paste the ID into the login screen (or tap **🌐 Open Dashboard** in any bot reply for one-tap auto-login via `?tg=` deep link).

## Local dev (no Docker)

Each service has its own `package.json`. Run from each folder:

```bash
# backend
cd backend && npm install && cp ../.env.example .env  # set DATABASE_URL, REDIS_URL, BOT_TOKEN, OPENAI_API_KEY
npm run dev

# worker
cd worker && npm install && npm run dev

# frontend
cd frontend && npm install && npm run dev    # http://localhost:5173
```

The backend can also embed the voice worker for single-process dev (`ENABLE_VOICE_WORKER` unset). In docker-compose the standalone worker container owns it, so the backend sets `ENABLE_VOICE_WORKER=false`.

## Telegram UX

- **Text or voice** → bot creates a task, replies with a card showing status + inline buttons (`🚧 In Progress`, `✅ Done`, `🗑️ Delete`, `🌐 Dashboard`).
- **Voice** flow: bot replies `🎤 Processing voice…` immediately; that stub is edited in place to the transcript when Whisper returns, then the task card follows.
- **/ menu** is registered via `setMyCommands`: `/mytasks /myid /progress /done /delete`.
- **🌐 Dashboard buttons** carry a `?tg=<id>` deep link — the SPA reads it, persists to localStorage, strips the param, and logs the user in automatically.

## Resilience (voice path)

- BullMQ defaults on `voice-processing`: `attempts: 3` with exponential backoff (2 s base) — a single transient OpenAI 5xx no longer becomes a permanent failure.
- `removeOnComplete: 100`, `removeOnFail: 500` cap Redis usage on free-tier hosts.
- Whisper module: 20 s download timeout (Telegram CDN) and 60 s OpenAI timeout — bounded failure time, no infinite `🎤 Processing voice…`.
- Idempotency: voice jobs use `jobId: voice:<chatId>:<statusMessageId>` so a double-tapped voice note collapses to one job.
- Worker failure handler reports `attemptsMade / opts.attempts` and only notifies the user after the **final** retry — transient failures don't surface a misleading `❌ failed` message mid-retry.
- `worker.on("error")` logs the full error for both `voice-processing` and `bot-notifications` workers.

## Realtime

The backend's Socket.IO server uses per-user rooms (`user:<telegramId>`) and emits `task:created`, `task:updated`, `task:deleted`. The frontend's `useTasks` hook applies them to local state, so every bot interaction reflects on the dashboard instantly (and dashboard mutations reflect in the bot via the same socket-then-REST flow).

## Frontend highlights

- Kanban with three columns (Pending / In Progress / Completed) and a per-task delete button
- **Native HTML5 drag-and-drop** between columns (buttons stay as a touch/keyboard fallback — no extra dependencies)
- Pending updates set per task to disable card actions during in-flight requests
- Deep-link auto-login via `?tg=<id>` URL param (stripped after persisting to `localStorage`)

## Tech stack

| Layer | Choice |
|---|---|
| Bot | Telegraf (TS) |
| API | Express 5 + Prisma + Socket.IO |
| DB | PostgreSQL (Neon in prod, postgres:16-alpine locally) |
| Queue | BullMQ on Redis (Upstash in prod, redis:7-alpine locally) |
| Transcription | OpenAI Whisper |
| Frontend | React 19 + Vite + TypeScript |
| Container | Multi-stage Node 20 / Nginx Alpine images, docker-compose for orchestration |

## Production deployment

A free-tier Render deployment is wired via [render.yaml](render.yaml) — see [DEPLOYMENT.md](DEPLOYMENT.md). On Render, the backend runs all-in-one (API + bot + embedded voice worker) to fit the free plan; in docker-compose the worker is its own container as the spec asks.

## Repository layout

```
backend/         Express API + Telegraf bot + Prisma + Socket.IO
worker/          Standalone BullMQ consumer for voice transcription
frontend/        React + Vite Kanban dashboard
docker-compose.yml   5-service local orchestration
render.yaml      Render Blueprint (single-service prod deploy)
```
