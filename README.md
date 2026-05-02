# Activity Tracker — Facebook Messenger

A production-ready Node.js + Express backend that turns Messenger messages
sent to your Facebook Page into structured, queryable activity records
(DONE, BLOCKER, FYI, MEETING, INCIDENT, REQUEST, …) backed by **Postgres**,
with daily/weekly reports.

## What it does

- Verifies and receives Meta Messenger webhooks.
- Validates `x-hub-signature-256` using your `APP_SECRET`.
- Stores every Messenger event and classifies messages into categories.
- Parses hashtags (`#done`, `#urgent`), structured fields
  (`#team:Alpha`, `#project:HOApp`, `#priority:high`), and ticket refs
  (`HOAPP-123`).
- Optionally replies to the sender with a confirmation
  ("Logged ✅ Category: DONE").
- Exposes REST endpoints for activity listing and analytics reports.

## Meta setup status (your context)

- ✅ Meta Developer App "Activity Tracker" created.
- ✅ Use case "Engage with customers on Messenger from Meta" added.
- ✅ Facebook Page "HOApp" connected.
- ✅ Page Access Token generated and copied.
- ⏳ Webhook NOT yet configured — see steps below.
- ⏳ Subscriptions (`messages`, `messaging_postbacks`) not yet added.

## Requirements

- Node.js ≥ 18
- A Postgres database (local Postgres, Neon, Supabase, Vercel Postgres,
  Render Postgres, RDS, …)

## Install

```bash
npm install
```

## Configure

```bash
cp .env.example .env
```

| Variable             | Description |
|----------------------|-------------|
| `PORT`               | HTTP port (default `3000`). Ignored on Vercel. |
| `NODE_ENV`           | `development` or `production`. |
| `VERIFY_TOKEN`       | Secret string YOU choose; pasted into Meta. |
| `PAGE_ACCESS_TOKEN`  | From Meta Messenger API Settings. |
| `APP_SECRET`         | From Meta App Settings → Basic → App Secret. |
| `GRAPH_API_VERSION`  | Default `v21.0`. |
| `ENABLE_AUTO_REPLY`  | `true` to send confirmation replies. |
| `ADMIN_API_KEY`      | Required for `POST /messages/send`. |
| `DATABASE_URL`       | Postgres connection string. |
| `PGSSL`              | `true` for managed Postgres (Neon, Supabase, Vercel Postgres). |
| `CORS_ORIGIN`        | `*` or comma-separated origin list. |

## Run locally

Spin up Postgres locally, e.g.:

```bash
docker run --name actpg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=activity_tracker -p 5432:5432 -d postgres:16
```

Then:

```bash
npm run db:migrate     # one-time (also runs lazily on first request)
npm run dev
```

## Expose locally over HTTPS (for Meta webhook)

Meta requires a **public HTTPS** URL. Use any tunneling tool, e.g.:

```bash
cloudflared tunnel --url http://localhost:3000
```

Your callback URL becomes `https://<random>.trycloudflare.com/webhook`.

## Configure the Meta webhook

In Meta App Dashboard → Messenger → API Settings → **Step 1: Configure webhooks**:

1. **Callback URL**: `https://your-domain.com/webhook`
2. **Verify token**: paste the same string as `VERIFY_TOKEN`.
3. Click **Verify and Save**.

## Add subscriptions

In Meta App Dashboard → Messenger → API Settings → Webhooks section:

1. Find the **HOApp** page row → **Add Subscriptions**.
2. Tick `messages` and `messaging_postbacks`. Save.

## Test end-to-end

1. From an admin/developer/tester account of the app, message **HOApp** on Messenger:

   ```
   DONE: Completed test activity #project:HOApp #team:Core HOAPP-1
   ```

2. Watch logs for `Activity stored:`. If `ENABLE_AUTO_REPLY=true`, you’ll
   see `Logged ✅ Category: DONE` come back in Messenger.

3. Query the API:

   ```bash
   curl https://your-domain.com/activities
   curl "https://your-domain.com/reports/daily?date=$(date -u +%F)"
   ```

## REST API

| Method | Path                   | Description                                   |
|--------|------------------------|-----------------------------------------------|
| GET    | `/health`              | Liveness check.                               |
| GET    | `/webhook`             | Meta verification handshake.                  |
| POST   | `/webhook`             | Meta event delivery (signature-validated).    |
| GET    | `/activities`          | Filterable list of activities.                |
| GET    | `/reports/daily`       | `?date=YYYY-MM-DD` (defaults to today UTC).   |
| GET    | `/reports/weekly`      | `?start=YYYY-MM-DD` (7-day window).           |
| GET    | `/reports/categories`  | `?from=ISO&to=ISO` category counts.           |
| GET    | `/reports/users`       | `?from=ISO&to=ISO` per-sender counts.         |
| POST   | `/messages/send`       | Admin-only test send. Header `x-admin-api-key`. |

`/activities` query params: `from`, `to`, `category`, `sender_psid`, `team`,
`project`, `limit`, `offset`.

## Classification rules

- `DONE:` prefix or `#done` → **DONE**
- `BLOCKER:` or `#blocker` → **BLOCKER**
- `FYI:` or `#fyi` → **FYI**
- `MEETING:` or `#meeting` → **MEETING**
- `INCIDENT:` or `#incident` → **INCIDENT**
- `REQUEST:` or `#request` → **REQUEST**
- otherwise → **UNKNOWN**

Plus parsed: `#team:X`, `#project:X`, `#priority:X`, ticket refs like `ABC-123`,
and a flat list of plain hashtags as tags.

---

## Deploy to GitHub + Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial: Messenger activity tracker (Express + Postgres)"
gh repo create messenger-activity-tracker --private --source . --remote origin --push
```

### 2. Provision a Postgres database

Pick any provider — easiest options that work great with Vercel:

- **Vercel Postgres** (Neon under the hood) — Storage tab in Vercel dashboard.
- **Neon** — https://neon.tech (free tier).
- **Supabase** — https://supabase.com (use the connection string from Project
  Settings → Database; append `?sslmode=require`).

Copy the connection string. For all managed providers, also set `PGSSL=true`.

### 3. Import the repo into Vercel

1. https://vercel.com/new → Import the GitHub repo.
2. Framework preset: **Other**. Leave build/install commands at defaults.
3. Add **Environment Variables** (Production + Preview):
   - `VERIFY_TOKEN`
   - `PAGE_ACCESS_TOKEN`
   - `APP_SECRET`
   - `GRAPH_API_VERSION` = `v21.0`
   - `ENABLE_AUTO_REPLY` = `true`
   - `ADMIN_API_KEY`
   - `DATABASE_URL`
   - `PGSSL` = `true`
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = `*` (or your origin)
4. Deploy.

### 4. Run the first migration

The schema is also created lazily on the first request, but you can force it:

```bash
curl https://<your-vercel-app>.vercel.app/health
```

Or, locally with the production `DATABASE_URL`:

```bash
DATABASE_URL=... PGSSL=true npm run db:migrate
```

### 5. Point Meta at Vercel

Use `https://<your-vercel-app>.vercel.app/webhook` as the callback URL with
the same `VERIFY_TOKEN` you set in Vercel.

### Vercel notes

- The Express app is mounted as a single serverless function via
  [`api/index.js`](api/index.js); all paths are routed there by
  [`vercel.json`](vercel.json).
- The function returns 200 quickly and processes events synchronously inside
  the request — Vercel kills work that continues after the response, so we do
  not use `setImmediate` for background tasks in production.

> Important: the POST `/webhook` handler on serverless platforms must
> finish DB writes before returning. The current implementation already
> awaits processing **inside** the handler when `process.env.VERCEL` is
> set; otherwise it returns 200 fast and processes in the background.

## App Review note

While in **Development** mode, only admins/developers/testers added to the
app can message the Page and trigger your webhook. Public use requires
`pages_messaging` and **Meta App Review**.

## Security notes

- `APP_SECRET`, `PAGE_ACCESS_TOKEN`, and `ADMIN_API_KEY` are never logged.
- Webhook signatures are verified using HMAC-SHA256 with `APP_SECRET`.
- In production, missing/invalid signatures are rejected.
- Helmet, CORS, and a basic rate limiter are enabled.

## Project structure

```
activity-tracker-messenger/
  api/index.js          # Vercel serverless entry
  vercel.json
  package.json
  README.md
  .env.example
  .gitignore
  src/
    app.js              # Express app (exported)
    server.js           # Local listener
    config.js
    db/
      database.js       # pg Pool
      migrations.js
    middleware/
      metaSignature.js
      errorHandler.js
      adminAuth.js
    routes/
      webhook.routes.js
      activities.routes.js
      reports.routes.js
      messages.routes.js
      health.routes.js
    services/
      messenger.service.js
      activity.service.js
      classifier.service.js
      reports.service.js
    utils/
      dates.js
      logger.js
```
