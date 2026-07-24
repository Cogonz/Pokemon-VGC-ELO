import { auth, signIn, signOut } from '@/auth';

export async function AuthStatus() {
    const session = await auth();

    if (!session?.user) {
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
            <span className="text-sm text-gray-600">{session.user.name ?? session.user.email}</span>
            <button type="submit" className="text-sm font-medium text-gray-500 hover:text-gray-700">
                Sign out
            </button>
        </form>
    );
}
