# Free Deployment

This repo is prepared to run the backend API, Telegram bot webhook, and voice
worker inside one Render free web service. The data services stay external:

- Frontend: GitHub Pages
- Backend/API/Bot/Voice worker: Render free web service
- Postgres: Neon free Postgres
- Redis queue: Upstash Redis free tier
- Voice transcription: OpenAI API key

Render free web services sleep after idle periods, so the first request after
sleep can take about a minute.

## 1. Create Neon Postgres

1. Create a free project at Neon.
2. Copy the pooled Postgres connection string.
3. Keep it for `DATABASE_URL`.

It should look like:

```text
postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
```

## 2. Create Upstash Redis

1. Create a free Redis database at Upstash.
2. Copy the Redis connection string for ioredis.
3. Keep it for `REDIS_URL`.

It should look like:

```text
rediss://default:PASSWORD@HOST.upstash.io:6379
```

Use the `rediss://` URL, not the REST URL.

## 3. Create Render Web Service

Use either the root `render.yaml` blueprint or create the service manually.

Manual settings:

```text
Root Directory: backend
Runtime: Node
Build Command: npm ci && npx prisma migrate deploy && npm run build
Start Command: npm start
Plan: Free
```

Environment variables:

```text
DATABASE_URL=<Neon Postgres URL>
REDIS_URL=<Upstash Redis URL>
BOT_TOKEN=<Telegram bot token from BotFather>
OPENAI_API_KEY=<OpenAI API key>
CORS_ORIGIN=https://nemsime.github.io
ENABLE_VOICE_WORKER=true
NODE_VERSION=20
```

After the first deploy, Render gives you a URL like:

```text
https://chemkarumel-backend.onrender.com
```

If Telegram webhook setup fails because Render does not expose its URL in the
environment, add this env var and redeploy:

```text
PUBLIC_URL=https://chemkarumel-backend.onrender.com
```

Open the Render URL in a browser. You should see:

```text
Backend is running
```

## 4. Point GitHub Pages to the Backend

In the GitHub repo:

```text
Settings -> Secrets and variables -> Actions -> Variables
```

Add or update:

```text
VITE_API_URL=https://chemkarumel-backend.onrender.com
```

Then redeploy:

```text
Actions -> Deploy frontend to GitHub Pages -> Run workflow
```

## 5. Test

1. Open the GitHub Pages dashboard.
2. Send `/myid` to the Telegram bot.
3. Paste the ID into the dashboard.
4. Send a text task to the bot.
5. Send a voice task to the bot.

Text tasks should appear immediately. Voice tasks depend on Redis, the worker,
and `OPENAI_API_KEY`.
