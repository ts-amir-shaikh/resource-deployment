'use client';

import { Analytics } from '@vercel/analytics/next';

/**
 * Page-view analytics, minus the set-password page. Its link code already
 * sits after # and never reaches a server, but the page carries nothing worth
 * measuring and is the one place an account secret passes through, so it is
 * not reported at all. Every other page is recorded as before.
 */
export default function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => (new URL(event.url).pathname.startsWith('/set-password') ? null : event)}
    />
  );
}
