'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  Network,
  FileSignature,
  ReceiptIndianRupee,
  Target,
  UserSearch,
  ClipboardList,
  Sparkles,
  LogOut,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
  Compass,
  Handshake,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navFor } from '@/lib/access';
import { ROLE_LABELS, type Session } from '@/lib/auth';
import { SIDEBAR_COOKIE } from '@/lib/prefs';

/**
 * Which links exist is decided by lib/access.ts — the same table middleware
 * enforces — so the sidebar can never offer a page the request would reject.
 * This map only supplies the icon for each.
 */
const ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/my': ClipboardList,
  '/leads': Compass,
  '/sales': Handshake,
  '/pipeline': Target,
  '/candidates': UserSearch,
  '/agents': Sparkles,
  '/resources': Users,
  '/clients': Building2,
  '/projects': FolderKanban,
  '/deployments': Network,
  '/agreements': FileSignature,
  '/invoices': ReceiptIndianRupee,
};

/** M27 — the pending/new counts the Candidates link carries. */
type Applicants = { pending: number; fresh: number; uncalled: number };

/*
 * M37 — the collapse preference lives in a cookie, not localStorage.
 *
 * The layout is a server component that already reads cookies for the
 * session, so it renders the right width on the first paint. Read from
 * localStorage instead and the server would render expanded, then the browser
 * would snap it shut a frame later — on every single navigation.
 */

export default function Sidebar({
  session,
  applicants,
  initialCollapsed = false,
}: {
  session: Session | null;
  applicants?: Applicants | null;
  initialCollapsed?: boolean;
}) {
  // Every hook runs before any early return, per the rules of hooks.
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // A year, path-wide, SameSite so it never rides along on a cross-site
    // request. Nothing sensitive in it: one word about a layout preference.
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
  }

  // Below the md breakpoint the rail is always narrow; the toggle only has
  // an effect on wider screens. `wide` is the class prefix that expresses
  // "expanded at md and above".
  const wide = collapsed ? 'hidden' : 'hidden md:inline';
  const wideBlock = collapsed ? 'hidden' : 'hidden md:block';

  // The public stakeholder view and the sign-in screen get no app chrome.
  if (pathname.startsWith('/share/') || pathname.startsWith('/jobs')) return null;
  if (pathname === '/login') return null;
  if (!session) return null;

  const items = navFor(session.role);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    // Sticky at the viewport's height rather than stretched to the content's.
    // As a plain flex child of a min-h-screen row it grew with the page, so on
    // a long list the sign-out block sat at the bottom of the document instead
    // of the bottom of the screen. The link list scrolls within itself.
    <nav
      className={cn(
        'sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150',
        collapsed ? 'w-14' : 'w-14 md:w-56',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2.5 border-b border-line px-3', !collapsed && 'md:px-4')}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">
          RD
        </div>
        <div className={cn('min-w-0', wideBlock)}>
          <div className="truncate text-sm font-semibold text-ink">Deployment</div>
          <div className="truncate text-2xs text-ink3">Techstalwarts</div>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {items.map(({ href, label }) => {
          const Icon = ICONS[href] ?? LayoutDashboard;
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          // Anything new since this person last opened the queue is worth
          // interrupting them for; a backlog they have already seen is not, so
          // a count with nothing fresh in it stays quiet.
          const badge =
            href === '/candidates' && applicants?.fresh ? applicants.fresh : 0;
          return (
            <li key={href}>
              <Link
                href={badge ? '/candidates?tab=applicants' : href}
                title={
                  badge
                    ? `${label} · ${badge} new applicant${badge === 1 ? '' : 's'}`
                    : label
                }
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brandbg text-brand'
                    : 'text-ink2 hover:bg-surface2 hover:text-ink',
                )}
              >
                <span className="relative shrink-0">
                  <Icon className="h-4 w-4" strokeWidth={2} />
                  {/* On the collapsed rail the label is hidden, so the count
                      rides the icon instead of sitting beside nothing. */}
                  {badge > 0 && (
                    <span
                      className={cn(
                        'absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white',
                        !collapsed && 'md:hidden',
                      )}
                    >
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className={wide}>{label}</span>
                {badge > 0 && (
                  <span
                    className={cn(
                      'ml-auto rounded-full bg-amber-100 px-1.5 text-2xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                      wide,
                    )}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line p-2">
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="mb-1 hidden w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-ink3 transition-colors hover:bg-surface2 hover:text-ink md:flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={2} />
          ) : (
            <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={2} />
          )}
          <span className={wide}>Collapse</span>
        </button>
        <div
          className={cn('mb-1 px-2.5 py-1.5', wideBlock)}
          title={`${session.name} · ${ROLE_LABELS[session.role]}`}
        >
          <div className="truncate text-xs font-medium text-ink">{session.name}</div>
          <div className="flex items-center gap-1 text-2xs text-ink3">
            {session.role === 'management' && <Eye className="h-3 w-3 shrink-0" />}
            <span className="truncate">
              {ROLE_LABELS[session.role]}
              {session.role === 'management' && ' · view only'}
            </span>
          </div>
        </div>
        <button
          onClick={signOut}
          title="Sign out"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-ink2 transition-colors hover:bg-surface2 hover:text-ink"
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span className={wide}>Sign out</span>
        </button>
      </div>
    </nav>
  );
}
