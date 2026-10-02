import { auth } from '@/auth';

export function isAuthConfigured(): boolean {
    return Boolean(process.env.AUTH_SECRET && process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
}

// Login is optional: if it isn't configured (or auth() throws) the public site must keep
// working, so this resolves to null instead of throwing. Returns the signed-in user id only.
export async function getUserId(): Promise<string | null> {
    if (!isAuthConfigured()) return null;
    try {
        const session = await auth();
        return session?.user?.id ?? null;
    } catch {
        return null;
    }
}
