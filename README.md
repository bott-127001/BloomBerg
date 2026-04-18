# Nifty Signal

Production-style monorepo for the Nifty 50 gap strategy: **Express + MongoDB** API with **Vite/React/Tailwind** dashboard, Upstox market data (rate-limited), daily scan pipeline, and JWT cookie auth.

## Prerequisites

- Node.js 20+ recommended
- MongoDB URI (Atlas or self-hosted)
- Upstox API v2 access token (`UPSTOX_TOKEN`)

## Environment variables

Set these locally (e.g. `.env` in `server/` or repo root; `server/index.js` loads via `dotenv` from cwd) and in Render:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Mongo connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `AUTH_USERNAME` | Seed user username (created if DB has no users) |
| `AUTH_PASSWORD` | Seed user password |
| `UPSTOX_TOKEN` | Bearer token for `api.upstox.com` |
| `PORT` | Server port (default `10000`) |
| `NODE_ENV` | `production` in prod (secure cookies) |

## Scripts (repo root)

- `npm install` — install all workspaces
- `npm run dev` — API (`node --watch`) on `PORT` + Vite dev server (proxies `/api` to `http://127.0.0.1:10000`)
- `npm run build` — client build outputs to `server/public`, then server `build` step
- `npm start` — run production server
- `npm run verify:reliance` — fetch RELIANCE + Nifty, print rulebook metrics and F1–F5 (needs `UPSTOX_TOKEN`)

## API overview

- `GET /health` — liveness
- `POST /api/auth/login` / `POST /api/auth/logout` — JWT in httpOnly cookie
- Protected (`Cookie` required): `GET /api/signal/today`, `GET /api/signal/history`, `POST /api/scan/trigger`, `GET /api/scan/status`, `GET /api/market/indices`

Cron (IST): pre-warm daily cache **09:00**, scan **09:28**, EOD marker **15:35** weekdays (see `server/strategy/scheduler.js`).

## Deploy (Render)

`render.yaml` defines a web service with `buildCommand: npm install && npm run build` and `startCommand: npm start`. Configure secret env vars in the Render dashboard.

## Strategy reference

Rulebook: `nifty50_strategy_rulebook.html` in this repo.
