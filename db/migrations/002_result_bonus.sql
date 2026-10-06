-- Tournament-results bonus for ratings (lib/results.ts). Additive and idempotent: safe to run on a
-- live database before deploying the code that reads the column. Values are filled by `npm run ingest`.
ALTER TABLE pokemon_elo ADD COLUMN IF NOT EXISTS result_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_elo  ADD COLUMN IF NOT EXISTS result_bonus INTEGER NOT NULL DEFAULT 0;
