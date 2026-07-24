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
