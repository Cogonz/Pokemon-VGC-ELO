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
- **Auth.js** with GitHub OAuth for sign-in
- **Docker** for containerization, **AWS CDK** for infra (VPC/RDS/ECR/Fargate), **GitHub
  Actions** for CI and deploy

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
AUTH_SECRET="..."               # generate with: openssl rand -base64 32
AUTH_GITHUB_ID="..."            # from a GitHub OAuth App, see below
AUTH_GITHUB_SECRET="..."
```

For GitHub sign-in to work locally, create an OAuth App at
[github.com/settings/developers](https://github.com/settings/developers) with homepage
`http://localhost:3000` and callback `http://localhost:3000/api/auth/callback/github`.

Other scripts: `npm run typecheck`, `npm run build`.

## Project structure

- [`ingestion.ts`](ingestion.ts) — pulls tournaments/standings/pairings from the Limitless
  API and persists them to Postgres. Incremental: the first run seeds recent history, every
  run after that only pulls tournaments newer than whatever's already in the database, so it's
  safe to re-run on a schedule (e.g. monthly) without re-fetching or losing older data
- [`schemas.ts`](schemas.ts) — zod schemas for the Limitless API responses
- [`secrets.ts`](secrets.ts) — AWS Secrets Manager lookup for the (optional) Limitless API key
- [`db/schema.sql`](db/schema.sql) — the Postgres schema (`tournaments`, `standings`,
  `team_pokemon`, `matches`)
- [`lib/stats.ts`](lib/stats.ts), [`lib/elo.ts`](lib/elo.ts),
  [`lib/pokemon-elo.ts`](lib/pokemon-elo.ts) — the three stats computations described above
- [`app/`](app) — the Next.js site (stats page + `/api/stats/*` routes + GitHub auth)
- [`infra/`](infra) — AWS CDK stack for deployment
- [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml) — containerization

## Deployment

`infra/` defines a CDK stack (VPC, RDS Postgres, ECR, Fargate) for a real AWS deployment; see
[`infra/lib/vgc-elo-stack.ts`](infra/lib/vgc-elo-stack.ts). This provisions real, billed
resources and isn't wired up to run automatically — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
is manual-trigger only.
