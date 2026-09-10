import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/sidebar';
import { getSession } from '@/lib/session';
import { applicantBadge } from '@/lib/badges';
import ViewOnlyBanner from '@/components/view-only-banner';
import { Analytics } from '@vercel/analytics/next';

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

  // M27 — the applicant badge. Computed in the layout so a recruiter working
  // the pipeline all morning still finds out that somebody applied, rather
  // than only learning it if they happen to open the right screen.
  const applicants = session ? await applicantBadge(session) : null;

  return (
    <html lang="en" className={inter.variable}>
      <body
        className="min-h-screen"
        data-readonly={session?.role === 'management' ? 'true' : undefined}
      >
        <div className="flex min-h-screen">
          <Sidebar session={session} applicants={applicants} />
          <main className="min-w-0 flex-1">
            <ViewOnlyBanner role={session?.role ?? null} />
            {children}
          </main>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
