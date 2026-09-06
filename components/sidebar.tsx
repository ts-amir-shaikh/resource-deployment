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
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Pipeline', icon: Target },
  { href: '/candidates', label: 'Candidates', icon: UserSearch },
  { href: '/resources', label: 'Resources', icon: Users },
  { href: '/clients', label: 'Clients', icon: Building2 },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/deployments', label: 'Deployments', icon: Network },
  { href: '/agreements', label: 'Agreements', icon: FileSignature },
  { href: '/invoices', label: 'Invoices', icon: ReceiptIndianRupee },
];

export default function Sidebar() {
  // Both hooks run before any early return, per the rules of hooks.
  const pathname = usePathname();
  const router = useRouter();

  // The public stakeholder view and the sign-in screen get no app chrome.
  if (pathname.startsWith('/share/') || pathname === '/login') return null;

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
        {NAV.map(({ href, label, icon: Icon }) => {
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
