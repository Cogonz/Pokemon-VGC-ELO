-- Basic schema to validate Limitless ingestion locally.
-- One row per tournament / standing / team pokemon -- no Elo tables yet.

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

-- User-built teams, saved by a signed-in Auth.js user ("User" table comes
-- from the Auth.js Prisma adapter, not this file). `pokemon` mirrors
-- SaveTeamRequest.pokemon (schemas.ts) as-is -- no relational queries are
-- ever needed across it, so JSONB avoids a needless child table.
CREATE TABLE IF NOT EXISTS saved_teams (
    id         SERIAL PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    pokemon    JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_teams_user_idx ON saved_teams(user_id);

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
