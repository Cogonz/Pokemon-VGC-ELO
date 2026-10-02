// Edge-safe half of the Auth.js config: no database adapter, no Prisma. Anything that needs to
// run in Edge middleware (none today) must import this file, never `auth.ts`.
import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const authConfig = {
    providers: [GitHub], // reads AUTH_GITHUB_ID / AUTH_GITHUB_SECRET from the environment
    // JWT sessions: no DB read per request (good for serverless + a pooled Neon connection).
    // The adapter (auth.ts) is still used to persist User/Account rows at sign-in.
    session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
    callbacks: {
        // token.sub is the adapter's User.id; expose it so API routes can enforce ownership.
        session({ session, token }) {
            if (token.sub) session.user.id = token.sub;
            return session;
        },
    },
} satisfies NextAuthConfig;
