# Pokemon VGC ELO

A stats site for competitive Pokemon VGC (Video Game Championships), built on real tournament
data pulled from [Limitless TCG](https://limitlesstcg.com). Personal project for VGC teambuilding.

## What it does

Ingested tournament standings and match results feed three stats, all computed straight from
the data (no hand-tuned tier lists):

- **Pokemon usage** — usage rate and average tournament placement per species.
- **Player Elo** — a standard Elo rating computed from match-level results (who beat whom),
  replayed in chronological order across every ingested tournament so a player's rating
  persists between events instead of resetting each time.
- **Pokemon Elo** — the more interesting one. VGC is a team game, so "how good is this
  Pokemon" isn't a single win/loss like a 1v1 rating. This is fit as one joint
  L2-regularized logistic regression over the entire match history (the "adjusted
  plus-minus" method sports analytics uses to credit individuals from team outcomes):
  each match is a training row where a Pokemon unique to the winning side is `+1`, unique
  to the losing side is `-1`, and a Pokemon on **both** rosters (a mirror) is `0` — it
  can't explain who won that specific game, so it nets to exactly zero by construction,
  no special-casing required. The ridge penalty also shrinks thin-sample Pokemon back
  toward a neutral rating, so a handful of games can't fake an extreme score.

The Limitless API only exposes each player's full registered decklist per tournament, never
which specific 4 of 6 were brought to an individual game — so every match a player plays
uses their whole registered roster as the "general" team for attribution purposes.

## Tech stack

- **TypeScript** end to end
- **Next.js** (App Router) for the frontend and API routes, **Tailwind** + **Recharts** for
  the UI
- **Postgres** + **Prisma** for storage
- **Vercel** (Hobby) hosting with **Neon** Postgres; **GitHub Actions** for CI and scheduled ingestion
- Also in the repo as a showcase (not used for the Vercel deploy): **Docker** and **AWS CDK**
  (VPC/RDS/ECR/Fargate)

## Getting started

Prerequisites: Node.js, a local Postgres instance running, and a `.env` file (see below).

```bash
npm install
createdb vgc_elo                # if it doesn't already exist
psql vgc_elo -f db/schema.sql   # create the tables
npm run ingest                  # pull tournaments from Limitless into Postgres
npm run dev                     # start the app at localhost:3000
```

`.env` needs:

```
DATABASE_URL="postgresql://<user>@localhost:5432/vgc_elo"
# optional: LIMITLESS_API_KEY="..."   (higher Limitless rate limits)
```

`npm run ingest` also recomputes and stores the Elo ratings (see below); the site only reads them.

Other scripts: `npm run typecheck`, `npm run build`.

## Project structure

- [`ingestion.ts`](ingestion.ts) — pulls tournaments/standings/pairings from the Limitless
  API and persists them to Postgres. Incremental: the first run seeds recent history, every
  run after that only pulls tournaments newer than whatever's already in the database, so it's
  safe to re-run on a schedule (e.g. monthly) without re-fetching or losing older data. To
  extend history further back (a one-off, can take a while), run
  `npm run ingest -- --until=YYYY-MM-DD`
- [`schemas.ts`](schemas.ts) — zod schemas for the Limitless API responses
- [`db/schema.sql`](db/schema.sql) — the Postgres schema (`tournaments`, `standings`,
  `team_pokemon`, `matches`, plus the precomputed `pokemon_elo` / `player_elo` tables)
- [`lib/stats.ts`](lib/stats.ts), [`lib/elo.ts`](lib/elo.ts),
  [`lib/pokemon-elo.ts`](lib/pokemon-elo.ts) — the three stats computations described above
- [`app/`](app) — the Next.js site (public stats page, team builder, `/api/stats/*` routes)
- [`lib/ratings-store.ts`](lib/ratings-store.ts) — computes Elo ratings per regulation during ingestion, stores
  them in Postgres, and reads them back for pages/API
- [`infra/`](infra) — AWS CDK stack (showcase, not used for the Vercel deploy)
- [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml) — containerization (showcase)

## Deployment (Vercel + Neon)

The site is a stateless Next.js app on Vercel (Hobby) reading from Neon Postgres. Nothing heavy
runs in a request: the joint Pokemon regression and player Elo replay take roughly 0.1-1.3 s of CPU
per regulation locally (about 6 s for all 8 regulations), plus pulling ~150k match rows, so
`npm run ingest` computes them once and stores them in `pokemon_elo` / `player_elo`. Pages and
`/api/stats/*` just read those tables (a few ms).

1. **Database.** In the Vercel project, Storage -> add Neon (Marketplace). It injects `DATABASE_URL`
   (pooled, used at runtime) and `DATABASE_URL_UNPOOLED` (direct, used by ingestion and Prisma
   schema commands).
2. **Create tables** once, against the direct URL: `psql "$DATABASE_URL_UNPOOLED" -f db/schema.sql`
   (or `DATABASE_URL_UNPOOLED=... npm run db:setup`, which runs `prisma db push`).
3. **Deploy** by connecting the GitHub repo to Vercel (git integration builds on every push;
   `postinstall` runs `prisma generate`). No `vercel.json` is needed.
4. **Load data.** The [Ingest workflow](.github/workflows/ingest.yml) runs monthly and on manual
   dispatch (Actions tab -> Ingest -> Run workflow). Repo secrets: `DATABASE_URL` (set it to the Neon
   *unpooled* URL) and optionally `LIMITLESS_API_KEY`. Run it once manually to seed the database.

Env vars: `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (set by Neon), optional `LIMITLESS_API_KEY`.

`infra/`, the `Dockerfile` and `docker-compose.yml` define a separate AWS (VPC, RDS, ECR, Fargate)
deployment. They stay as a showcase and are not used for, or required by, the Vercel deploy.

## TODO

- Optional login (Auth.js / GitHub OAuth) for saving teams from the team builder. Removed for now;
  the stats pages are fully public and need no account.
