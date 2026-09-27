import type { Metadata } from 'next';
import SetPasswordClient from './client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Set your password · Resource Deployment',
  // The link's code sits after # and never leaves the browser, but this page
  // still sends no Referer anywhere and is kept out of search results.
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

/** Public: where an emailed password link lands (R7). */
export default function SetPasswordPage() {
  return <SetPasswordClient />;
}
