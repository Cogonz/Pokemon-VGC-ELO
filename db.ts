// Ingestion/scripts use the direct (unpooled) Neon connection when available:
// long transactions don't suit PgBouncer-style transaction pooling.
import { Pool } from 'pg';

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/vgc_elo',
});
