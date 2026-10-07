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

## Tournament results bonus

Match Elo (above) is stored as `rating`; `result_bonus` is added on top for display. It is positive-only
(poor finishes never subtract, since those games already moved Elo) and computed in
[`lib/results.ts`](lib/results.ts) during ingestion:

- **Placement score:** winner 1.0, finalist 0.6, top 4 0.4, top 8 0.25, top 16 0.1, times a field-size
  weight (30 players ~0.68, 64 = 1.0, 128+ ~1.4-1.5).
- **Players:** `60 * (1 - exp(-points / 3))`, so the bonus saturates (first wins matter most; max +60).
- **Pokemon:** a team's points go to each of its six Pokemon. The bonus compares a Pokemon's average points
  per team with the average across all teams, shrunk toward the average for rarely-seen Pokemon (max +25), so a
  common Pokemon isn't rewarded just for appearing on many teams.

The Players and Pokemon tables have a "Tournament results" toggle to show match Elo alone. Existing databases
need `db/migrations/002_result_bonus.sql` (additive) before deploying.

## Attribute impact (items, abilities, natures, moves)

Each Pokemon's detail page shows how teams using a held item, ability, nature or move did compared with teams
using that Pokemon's *other* options, in Elo points ([`lib/attribute-impact.ts`](lib/attribute-impact.ts), stored in
`attribute_impact`). It is one joint regularized logistic regression per regulation with features for the Pokemon,
each Pokemon+attribute pair, and the player, so every attribute is controlled for the others and for who was playing.

- **Relative, not absolute:** the baseline is the team-weighted average of the *other* options (the option itself is
  left out, so a dominant option isn't compared against itself and forced to ~0). This says how a choice compares
  with the alternatives; how good it is on its own can't be identified from this data. Near zero on a popular option
  means it performs like the rest.
- **Noise guard:** a dominant option has few alternatives to compare with, so a badge is greyed out unless both the
  option and its alternatives have 50+ teams (`alt_teams` stores the comparison group size). Options on 90%+ of a
  Pokemon's teams have no comparison group and are not shown.
- Free-text values are merged case- and whitespace-insensitively ("intimidate" = "Intimidate"), shown with their most
  common spelling ([`lib/canonical.ts`](lib/canonical.ts)).
- It is an estimate: with few events per player, skill can still leak into the numbers, so read large swings on small
  samples skeptically. Existing databases need `db/migrations/004_attribute_impact.sql` and
  `005_attribute_alt_teams.sql`.

## Tech stack

- **TypeScript** end to end
- **Next.js** (App Router) for the frontend and API routes, **Tailwind** + **Recharts** for
  the UI
- **Postgres** + **Prisma** for storage
- **Vercel** (Hobby) hosting with **Neon** Postgres; **GitHub Actions** for CI and scheduled ingestion
- **Auth.js** (GitHub OAuth, optional) for saved teams
- Also in the repo (not used for the Vercel deploy): **Docker** and **AWS CDK** (VPC/RDS/ECR/Fargate
  showcase stack, plus an optional scheduled-ingestion stack)

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

Production URL: https://vgcelo.vercel.app (Vercel project `vgcelo`, linked from the portfolio site).

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

## Optional login (saved teams)

Sign-in is optional. Stats pages and the team-builder picker are fully public; only **Save team /
My Teams** needs a GitHub login (logged-out users see a "Sign in to save teams" prompt). If the
`AUTH_*` variables are unset, login is simply hidden and the rest of the site is unaffected.

Implementation: Auth.js (`next-auth@beta`, v5) + GitHub OAuth + the Prisma adapter, **JWT sessions**
(no DB read per request, a good fit for serverless + Neon's pooled URL). The config is split:
[`auth.config.ts`](auth.config.ts) is edge-safe (no adapter), [`auth.ts`](auth.ts) adds the Prisma
adapter and only runs in the Node runtime. Saved-team API: `GET/POST /api/teams`,
`GET/DELETE /api/teams/:id`. Every query is scoped by the signed-in user id (other users' teams
return 404), input is validated with zod (max 6 Pokemon, bounded string lengths, 16 KB body, 50
teams per user), and mutating routes require same-origin + `application/json` on top of Auth.js's
SameSite=Lax cookies. GitHub OAuth tokens are not persisted.

Setup:

1. Create a GitHub OAuth app (GitHub -> Settings -> Developer settings -> OAuth Apps -> New):
   - Homepage URL: `https://vgcelo.vercel.app`
   - Authorization callback URL: `https://vgcelo.vercel.app/api/auth/callback/github`
   - For local dev create a second app with callback `http://localhost:3000/api/auth/callback/github`.
2. Generate a secret: `npx auth secret` (or `openssl rand -base64 32`).
3. Set env vars (see [`.env.example`](.env.example)). Production:
   ```bash
   vercel env add AUTH_SECRET production
   vercel env add AUTH_GITHUB_ID production
   vercel env add AUTH_GITHUB_SECRET production
   ```
   Each command prompts for the value (don't paste secrets into files). `AUTH_TRUST_HOST=true` is
   only needed when self-hosting/Docker behind a proxy; Vercel doesn't need it. For local dev put
   the three values in `.env` (gitignored).
4. Create the auth tables on existing databases (purely additive, idempotent, no data touched):
   `psql "$DATABASE_URL_UNPOOLED" -f db/migrations/001_auth_saved_teams.sql`
   (alternatively `DATABASE_URL_UNPOOLED=... npm run db:setup`, i.e. `prisma db push`; fresh
   databases get everything from `db/schema.sql`). Do this before enabling the env vars.
5. Redeploy.

## Scheduled ingestion: GitHub Action vs AWS (ECS Fargate)

Two interchangeable ways to run `npm run ingest` monthly against Neon:

- **GitHub Action** ([`ingest.yml`](.github/workflows/ingest.yml)) - the default. Free, zero infra;
  use this unless you have a reason not to.
- **AWS scheduled task** ([`infra/lib/ingest-schedule-stack.ts`](infra/lib/ingest-schedule-stack.ts)) -
  EventBridge cron -> one-off Fargate task running the Docker `ingest` target, logs in CloudWatch,
  secrets from Secrets Manager. Use it if you want everything in AWS, longer/more controllable
  runs, IAM-managed secrets, or failure alerts by email. It is standalone: no RDS, no NAT, no load
  balancer. Run only one of the two schedulers.

```bash
docker build --target ingest -t vgc-elo-ingest .      # ingest-capable image (default target is the web app)
cd infra && npm install
npx cdk synth VgcIngestScheduleStack                    # no AWS credentials needed
# options: -c ingestCron="0 6 1 * *" -c limitlessKeySecretName=vgc-elo/limitless-api-key \
#          -c databaseUrlSecretName=vgc-elo/database-url-unpooled -c ingestImageTag=latest -c alertEmail=you@example.com
```

To actually deploy (manual, your AWS account): `cdk bootstrap`, create the Secrets Manager secret
`vgc-elo/database-url-unpooled` (plain string = Neon *unpooled* URL; optionally a second one for
`LIMITLESS_API_KEY`), `cdk deploy VgcIngestScheduleStack`, then push the image to the
`vgc-elo-ingest` ECR repo from the stack outputs. The task has a 2h in-container timeout; ingestion
is incremental, so a failed or timed-out run is resumed by the next run (or `aws ecs run-task`).
