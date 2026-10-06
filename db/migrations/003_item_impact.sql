-- Item impact table (lib/item-impact.ts). Additive and idempotent; filled by `npm run ingest`.
CREATE TABLE IF NOT EXISTS item_impact (
    format     TEXT NOT NULL,
    species_id TEXT NOT NULL,
    item       TEXT NOT NULL,
    teams      INTEGER NOT NULL,
    impact     INTEGER NOT NULL,
    PRIMARY KEY (format, species_id, item)
);
