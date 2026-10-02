import NextAuth from 'next-auth';
import type { DefaultSession } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { authConfig } from './auth.config';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
        } & DefaultSession['user'];
    }
}

const baseAdapter = PrismaAdapter(prisma);

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    adapter: {
        ...baseAdapter,
        // We only need identity, never GitHub API access: don't persist the OAuth tokens at rest.
        linkAccount: (account) => {
            const { access_token, refresh_token, id_token, ...safe } = account;
            void access_token; void refresh_token; void id_token;
            return baseAdapter.linkAccount!(safe);
        },
    },
});
