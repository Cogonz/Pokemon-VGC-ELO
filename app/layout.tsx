import type { Metadata } from 'next';
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
                <header className="flex justify-end border-b px-6 py-3">
                    <AuthStatus />
                </header>
                {children}
            </body>
        </html>
    );
}
