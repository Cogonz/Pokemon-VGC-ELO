import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { AuthStatus } from '@/components/AuthStatus';

export const metadata: Metadata = {
    title: 'Pokemon VGC ELO',
    description: 'VGC teambuilding and usage stats',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <header className="flex items-center justify-between border-b px-6 py-3">
                    <nav className="flex gap-4 text-sm font-medium text-gray-600">
                        <Link href="/" className="hover:text-gray-900">
                            Stats
                        </Link>
                        <Link href="/teambuilder" className="hover:text-gray-900">
                            Team Builder
                        </Link>
                    </nav>
                    <AuthStatus />
                </header>
                {children}
            </body>
        </html>
    );
}
