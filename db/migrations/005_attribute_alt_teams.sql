-- Impact is now measured against a Pokemon's OTHER values of the same attribute (lib/attribute-impact.ts);
-- alt_teams records how many teams that comparison group has. Additive; values are refilled by `npm run ingest`.
ALTER TABLE attribute_impact ADD COLUMN IF NOT EXISTS alt_teams INTEGER NOT NULL DEFAULT 0;
