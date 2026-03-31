# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev    # Dev server on :3000
npm run build  # Production build
npm start      # Production server
```

No lint or test scripts. Type-check manually with `tsc --noEmit` if needed. Path alias: `@/` maps to project root.

## What this app does

Pair-trade analytics dashboard for the BAJAJFINSV / BAJFINANCE spread. The "spread" is the implied residual value of Bajaj Finserv's subsidiaries after accounting for Bajaj Finance's market cap weighted by a quarterly stake percentage. Z-score signals (STRONG_LONG / LONG / HOLD / SHORT / STRONG_SHORT) drive trade entry/exit logic.

## Architecture

**Data pipeline (server-side, `app/page.tsx`):**
```
Supabase (eod_prices + stake_history + share_history + trading_rules)
  + Dhan live prices (market hours only)
  → computeSpreadSeries() → SpreadPoint[] → SpreadDashboard (client)
```

**Key computation files:**
- `lib/spread-calculator.ts` — all pure functions: `computeSpreadSeries()`, `calendarRollingStats()`, `getApplicableStake()`, `getApplicableShares()`, `getExitBasedObservations()`, `computeForwardReturns()`, `computeFixedWindowStats()`
- `lib/signal-generator.ts` — z-score → signal label/color (stateless)
- `lib/trade-signals.ts` — full trade lifecycle: `evaluateTradeSignal()`, `getBlendedEntry()`, `getDaysHeld()`
- `lib/dhan.ts` — rate-limited live prices with two-layer cache (in-memory 30s + Supabase global 30s)
- `lib/supabase.ts` — client init + `fetchAllEodPrices()` (paginated past 1000-row cap), `fetchRules()`, `fetchLatestShares()`, `fetchShareHistory()`
- `lib/session.ts` — browser localStorage UUID for visitor trade scoping
- `lib/local-rules.ts` — browser localStorage rule overrides (visitor sandbox)

**Rolling windows:** Calendar-anchored months (not trading days). 8 windows: 3M, 6M, 1Y, 2Y, 3Y, 4Y, 5Y, ALL. Each window computes mean, std, zscore, percentile_rank, ±1SD, ±2SD bands.

**MCap calculation:** Before `2026-03-27` (cutoff), uses stored Yahoo Finance MCap. From cutoff onwards, recomputes as `price × share_count / 1e7` using BSE share data. This constant appears in `lib/spread-calculator.ts` and `app/api/prices/live/route.ts`.

**Stake logic:** `getApplicableStake()` maps a date to the most recent prior `quarter_end_date` entry. Quarter ends: Mar 31, Jun 30, Sep 30, Dec 31.

## Auth model

- **Owner:** HttpOnly cookie `bajaj_owner=1` (7-day max age). Set via `POST /api/auth/verify-owner` with `OWNER_PASSWORD`. Detected client-side by probing `PATCH /api/rules` — 200 = owner, 403 = visitor.
- **Visitor:** Random UUID in localStorage (`X-Session-Token` header). Trades scoped to this token.
- **Owner trades:** Stored under `OWNER_SESSION_TOKEN` env var. Returned in `/api/trades` response only when `bajaj_owner` cookie present.
- **Rules:** Owner writes to DB; visitors write to localStorage only. DB rules polled every 60s and broadcast to all visitors.

## API routes

| Route | Auth | Notes |
|-------|------|-------|
| `GET /api/prices/live` | None | Dhan LTP during market hours (9:15–15:30 IST Mon–Fri), EOD fallback otherwise |
| `GET/PATCH /api/rules` | PATCH requires owner cookie | PATCH body: `[{ rule_key, rule_value }]` |
| `GET/POST /api/trades` | Session token header | POST creates tranche; GET returns visitor trades + owner trades if owner cookie present |
| `PATCH/DELETE /api/trades/[id]` | Session token or owner cookie | Owner can modify trades stored under `OWNER_SESSION_TOKEN` |
| `POST /api/auth/verify-owner` | Password in body | Sets `bajaj_owner` cookie |
| `GET /api/auth/dhan-callback` | `?secret=DHAN_CALLBACK_SECRET` | Saves new Dhan access token to Supabase `dhan_tokens` after DhanHQ redirect |
| `GET /api/cron/eod` | Cron secret | Runs 10:30 UTC Mon–Fri; seeds daily EOD row via Dhan |
| `GET /api/cron/renew-token` | Cron secret | Runs 00:30 UTC daily; renews Dhan JWT before 24h expiry |

## Dhan token lifecycle

Tokens expire every 24h. Daily cron at 06:00 IST calls `POST https://api.dhan.co/v2/RenewToken` using the current token from `dhan_tokens` table, saves the new one back. On first setup or chain break: generate Access Token on DhanHQ with redirect URL `https://bajaj-pair-trade-iyzo.vercel.app/api/auth/dhan-callback?secret=...` — callback auto-saves to Supabase. IDs: BAJFINANCE=317, BAJAJFINSV=16675 (NSE_EQ).

## Supabase tables

- `eod_prices` — date (PK), fin_price, fin_mcap, finsv_price, finsv_mcap, source
- `stake_history` — quarter_end_date (PK), stake_pct, source
- `share_history` — effective_date, company (BAJFINANCE|BAJAJFINSV), shares (absolute count)
- `trading_rules` — rule_key (PK), rule_value
- `active_trades` — id, trade_group, tranche_num, direction, window_key, entry/exit fields, status (open|closed), session_token, notes
- `dhan_tokens` — id=1 singleton; access_token, fin_price, finsv_price, prices_fetched_at, renewed_at

## Non-obvious patterns

- `fetchAllEodPrices()` paginates in 1000-row batches to bypass PostgREST's default row cap.
- `SpreadDashboard` is the single root client component managing all tab state. The server component (`app/page.tsx`) does all data fetching and passes it down as props.
- `recomputeSpreadSeries()` in spread-calculator is used when the owner edits stake history — it re-derives spread % and rolling windows without re-fetching from Supabase.
- `getExitBasedObservations()` scans history for analog entries within `entry_band` of the current z-score, walks each forward to find the exit event, and powers the "Trade Setup" tab's historical win-rate table.
- `z_override` in trading rules: nullable float; if set, all visitors see this as the current Z-score instead of the computed one (owner can manually force a signal state).
- Tranche sizing sequence: 50%, 30%, 20%, 10%, 10% (max 5 tranches per trade group).
- Light mode uses a custom CSS variable override (`--color-white` is remapped to dark brown in `.light` class in `globals.css`). Use `style={{ backgroundColor: '#ffffff' }}` for literal white, not `bg-white`.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DHAN_ACCESS_TOKEN          # Fallback only; runtime reads from dhan_tokens table
DHAN_CLIENT_ID
CRON_SECRET
OWNER_PASSWORD
OWNER_SESSION_TOKEN
DHAN_CALLBACK_SECRET       # Protects /api/auth/dhan-callback endpoint
```
