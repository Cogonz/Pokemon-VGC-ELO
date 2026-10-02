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
