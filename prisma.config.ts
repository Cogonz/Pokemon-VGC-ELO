import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        // Direct (unpooled) connection for schema changes when available (Neon/Vercel set
        // DATABASE_URL_UNPOOLED); the placeholder just lets `prisma generate` run without a DB.
        url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? 'postgresql://placeholder:5432/placeholder',
    },
});
