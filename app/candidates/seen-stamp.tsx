'use client';

import { useEffect } from 'react';

/**
 * Marks the applicant queue as seen, once, on arrival.
 *
 * A side effect rather than something the server does while rendering: a
 * render can be replayed, prefetched or streamed more than once, and a write
 * hidden inside one would clear the "new" badge for a page the user never
 * actually looked at.
 *
 * A failure here is deliberately silent. The worst case is that the badge
 * still shows the same count next time, which is a stale number rather than a
 * broken page — not worth an error message over.
 */
export default function SeenStamp() {
  useEffect(() => {
    fetch('/api/applications/seen', { method: 'POST' }).catch(() => {});
  }, []);
  return null;
}
