-- Postgres schema (applies to local Postgres and Neon). Mirrors prisma/schema.prisma.

CREATE TABLE IF NOT EXISTS tournaments (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    format  TEXT,
    date    TIMESTAMPTZ,
    players INTEGER
);

CREATE TABLE IF NOT EXISTS standings (
    id            SERIAL PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player        TEXT NOT NULL,
    name          TEXT NOT NULL,
    placement     INTEGER,
    wins          INTEGER NOT NULL,
    losses        INTEGER NOT NULL,
    ties          INTEGER NOT NULL,
    UNIQUE (tournament_id, player)
);

CREATE TABLE IF NOT EXISTS team_pokemon (
    id           SERIAL PRIMARY KEY,
    standing_id  INTEGER NOT NULL REFERENCES standings(id) ON DELETE CASCADE,
    species_id   TEXT NOT NULL,
    name         TEXT NOT NULL,
    item         TEXT,
    ability      TEXT,
    nature       TEXT,
    tera         TEXT,
    moves        TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS team_pokemon_species_idx ON team_pokemon(species_id);

CREATE TABLE IF NOT EXISTS matches (
    id            SERIAL PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    phase         INTEGER NOT NULL,
    round         INTEGER NOT NULL,
    player1       TEXT NOT NULL,
    player2       TEXT NOT NULL,
    winner        TEXT, -- NULL means a tie; otherwise always equals player1 or player2
    UNIQUE (tournament_id, phase, round, player1, player2)
);

CREATE INDEX IF NOT EXISTS matches_player1_idx ON matches(player1);
CREATE INDEX IF NOT EXISTS matches_player2_idx ON matches(player2);

-- Precomputed ratings, rewritten by ingestion (lib/ratings-store.ts) after every
-- run so page/API requests only read. Never computed in a request.
CREATE TABLE IF NOT EXISTS pokemon_elo (
    format     TEXT NOT NULL,
    species_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    rating     INTEGER NOT NULL,
    wins       INTEGER NOT NULL,
    losses     INTEGER NOT NULL,
    ties       INTEGER NOT NULL,
    matches    INTEGER NOT NULL,
    result_bonus INTEGER NOT NULL DEFAULT 0, -- tournament-results bonus (lib/results.ts); rating is match Elo alone
    PRIMARY KEY (format, species_id)
);

CREATE TABLE IF NOT EXISTS player_elo (
    format TEXT NOT NULL,
    player TEXT NOT NULL,
    name   TEXT NOT NULL,
    rating INTEGER NOT NULL,
    wins   INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    ties   INTEGER NOT NULL,
    result_bonus INTEGER NOT NULL DEFAULT 0, -- tournament-results bonus (lib/results.ts); rating is match Elo alone
    PRIMARY KEY (format, player)
);

-- Reference data sourced from PokeAPI (pokedex.ts), keyed by whatever
-- species_id/move name values Limitless actually uses -- not a full
-- Pokedex, just whatever we've actually ingested. The type effectiveness
-- chart itself is static and lives in lib/type-chart.ts instead of here.
CREATE TABLE IF NOT EXISTS pokemon_species (
    species_id TEXT PRIMARY KEY,
    type1      TEXT NOT NULL,
    type2      TEXT
);

CREATE TABLE IF NOT EXISTS move_reference (
    move_slug    TEXT PRIMARY KEY, -- lowercase-hyphenated, e.g. "dire-claw"
    display_name TEXT NOT NULL,
    type         TEXT NOT NULL,
    damage_class TEXT NOT NULL, -- physical | special | status
    power        INTEGER
);

-- ===== Optional login + saved teams (also available standalone: db/migrations/001_auth_saved_teams.sql) =====
-- Optional login (Auth.js + GitHub OAuth) and saved teams. Purely additive and idempotent:
-- safe to run against an existing database that already holds ingested data.
--   psql "$DATABASE_URL_UNPOOLED" -f db/migrations/001_auth_saved_teams.sql
-- Mirrors prisma/schema.prisma (Auth.js Prisma adapter tables use its default quoted names).

CREATE TABLE IF NOT EXISTS "User" (
    id              TEXT PRIMARY KEY,
    name            TEXT,
    email           TEXT,
    "emailVerified" TIMESTAMP(3),
    image           TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"(email);

CREATE TABLE IF NOT EXISTS "Account" (
    id                  TEXT PRIMARY KEY,
    "userId"            TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    type                TEXT NOT NULL,
    provider            TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token       TEXT,
    access_token        TEXT,
    expires_at          INTEGER,
    token_type          TEXT,
    scope               TEXT,
    id_token            TEXT,
    session_state       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key"
    ON "Account"(provider, "providerAccountId");

-- Unused with JWT sessions, but part of the Auth.js adapter schema.
CREATE TABLE IF NOT EXISTS "Session" (
    id             TEXT PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId"       TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    expires        TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");

CREATE TABLE IF NOT EXISTS "VerificationToken" (
    identifier TEXT NOT NULL,
    token      TEXT NOT NULL,
    expires    TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key"
    ON "VerificationToken"(identifier, token);

-- User-built teams. `pokemon` mirrors SaveTeamRequest.pokemon (schemas.ts); JSONB avoids a
-- child table since nothing queries across it.
CREATE TABLE IF NOT EXISTS saved_teams (
    id         SERIAL PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    pokemon    JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_teams_user_idx ON saved_teams(user_id);

-- Impact of items, abilities, natures and moves per Pokemon (lib/attribute-impact.ts), rewritten by
-- ingestion alongside the ratings.
CREATE TABLE IF NOT EXISTS attribute_impact (
    format     TEXT NOT NULL,
    species_id TEXT NOT NULL,
    kind       TEXT NOT NULL, -- item | ability | nature | move
    value      TEXT NOT NULL,
    teams      INTEGER NOT NULL,
    alt_teams  INTEGER NOT NULL DEFAULT 0, -- teams using this Pokemon's other values of the same attribute
    impact     INTEGER NOT NULL,
    PRIMARY KEY (format, species_id, kind, value)
);
