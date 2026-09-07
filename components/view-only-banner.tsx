'use client';

import { usePathname } from 'next/navigation';

/**
 * Client component purely so it can read the path: the public pages share the
 * root layout, and a signed-in Management user opening the job board should
 * not see internal chrome bolted onto a page meant for candidates.
 */
export default function ViewOnlyBanner({ role }: { role: string | null }) {
  const pathname = usePathname();
  if (role !== 'management') return null;
  if (pathname.startsWith('/jobs') || pathname.startsWith('/share/') || pathname === '/login')
    return null;

  return (
    <div className="border-b border-line bg-surface2 px-6 py-2 text-xs text-ink2">
      <strong className="font-medium text-ink">View only.</strong> Management access
      mirrors the full admin view; changes are disabled.
    </div>
  );
}
