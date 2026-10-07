-- Generalizes item_impact to items, abilities, natures and moves (lib/attribute-impact.ts).
-- Additive: creates the new table and carries existing item rows over. item_impact is dropped only
-- AFTER its rows are copied; it is derived data that `npm run ingest` regenerates anyway.
CREATE TABLE IF NOT EXISTS attribute_impact (
    format     TEXT NOT NULL,
    species_id TEXT NOT NULL,
    kind       TEXT NOT NULL,
    value      TEXT NOT NULL,
    teams      INTEGER NOT NULL,
    impact     INTEGER NOT NULL,
    PRIMARY KEY (format, species_id, kind, value)
);

DO $$
BEGIN
    IF to_regclass('item_impact') IS NOT NULL THEN
        INSERT INTO attribute_impact (format, species_id, kind, value, teams, impact)
        SELECT format, species_id, 'item', item, teams, impact FROM item_impact
        ON CONFLICT DO NOTHING;
        DROP TABLE item_impact;
    END IF;
END $$;
