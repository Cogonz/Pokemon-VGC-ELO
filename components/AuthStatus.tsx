import { auth, signIn, signOut } from '@/auth';
import { isAuthConfigured } from '@/lib/session';

// Optional login control. Renders nothing if login isn't configured, and never throws:
// the public stats pages must work without it.
export async function AuthStatus() {
    if (!isAuthConfigured()) return null;

    let user: { name?: string | null; email?: string | null } | null = null;
    try {
        user = (await auth())?.user ?? null;
    } catch {
        return null;
    }

    if (!user) {
        return (
            <form
                action={async () => {
                    'use server';
                    await signIn('github');
                }}
            >
                <button type="submit" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                    Sign in with GitHub
                </button>
            </form>
        );
    }

    return (
        <form
            action={async () => {
                'use server';
                await signOut();
            }}
            className="flex items-center gap-3"
        >
            <span className="text-sm text-gray-600">{user.name ?? user.email}</span>
            <button type="submit" className="text-sm font-medium text-gray-500 hover:text-gray-700">
                Sign out
            </button>
        </form>
    );
}
