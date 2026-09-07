'use client';

import Link from 'next/link';
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
  Sparkles,
  LogOut,
  Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navFor } from '@/lib/access';
import { ROLE_LABELS, type Session } from '@/lib/auth';

/**
 * Which links exist is decided by lib/access.ts — the same table middleware
 * enforces — so the sidebar can never offer a page the request would reject.
 * This map only supplies the icon for each.
 */
const ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
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

export default function Sidebar({ session }: { session: Session | null }) {
  // Both hooks run before any early return, per the rules of hooks.
  const pathname = usePathname();
  const router = useRouter();

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
    <nav className="flex w-14 shrink-0 flex-col border-r border-line bg-surface md:w-56">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-3 md:px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">
          RD
        </div>
        <div className="hidden min-w-0 md:block">
          <div className="truncate text-sm font-semibold text-ink">Deployment</div>
          <div className="truncate text-2xs text-ink3">Techstalwarts</div>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {items.map(({ href, label }) => {
          const Icon = ICONS[href] ?? LayoutDashboard;
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                title={label}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brandbg text-brand'
                    : 'text-ink2 hover:bg-surface2 hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="hidden md:inline">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line p-2">
        <div
          className="mb-1 hidden px-2.5 py-1.5 md:block"
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
          <span className="hidden md:inline">Sign out</span>
        </button>
      </div>
    </nav>
  );
}
