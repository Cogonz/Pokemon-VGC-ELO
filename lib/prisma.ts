import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveDatabaseUrl } from './db-url';

// Reuse the client across Next.js hot-reloads in dev so we don't exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
    if (!globalForPrisma.prisma) {
        const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
        globalForPrisma.prisma = new PrismaClient({ adapter });
    }
    return globalForPrisma.prisma;
}

// Created on first use, not at import time, so `next build` can collect route metadata
// (e.g. in CI) without a database configured.
export const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        const client = getClient();
        const value = Reflect.get(client, prop, client);
        return typeof value === 'function' ? value.bind(client) : value;
    },
});
