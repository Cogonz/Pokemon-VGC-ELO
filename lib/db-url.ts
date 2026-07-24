// Local dev sets DATABASE_URL directly. In ECS, the RDS-generated secret is
// injected as separate PG* fields (see infra/lib/vgc-elo-stack.ts), so we
// assemble the connection string from those instead.
export function resolveDatabaseUrl(): string {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

    const { PGHOST, PGPORT = '5432', PGUSER, PGPASSWORD, PGDATABASE } = process.env;
    if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
        return `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
    }

    throw new Error('No database connection configured (set DATABASE_URL, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE)');
}
