import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/sidebar';
import { getSession } from '@/lib/session';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Resource Deployment',
  description:
    'Manage and monitor consultant deployments, client engagements, agreements, and invoicing.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once here rather than in every page: the sidebar needs to know which
  // links this role has, and who is signed in.
  const session = await getSession();

  return (
    <html lang="en" className={inter.variable}>
      <body
        className="min-h-screen"
        data-readonly={session?.role === 'management' ? 'true' : undefined}
      >
        <div className="flex min-h-screen">
          <Sidebar session={session} />
          <main className="min-w-0 flex-1">
            {session?.role === 'management' && (
              <div className="border-b border-line bg-surface2 px-6 py-2 text-xs text-ink2">
                <strong className="font-medium text-ink">View only.</strong> Management
                access mirrors the full admin view; changes are disabled.
              </div>
            )}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
