'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Search, UserCog, Mail, History, X, FileClock } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate, LIST_PAGE_SIZE } from '@/lib/utils';
import { ROLES, ROLE_LABELS, TEAM_ROLES, type Role } from '@/lib/auth';
import { checkAccount, type AccountDraft } from '@/lib/accounts/policy';
import type { PersonRow } from '@/lib/accounts/people';
import { Combobox } from '@/components/combobox';
import { PageHeader, Modal, Field, Badge, EmptyState, TableShell, Pagination, type Tone } from '@/components/ui';
import { ExportButton, TickAllHeader, TickCell, useTicks } from '@/components/export-dialog';
import { peopleList, personStatus, PERSON_STATUS_LABELS, type PeopleFilters, type PersonStatus } from '@/lib/lists/people';

type ResourceOption = { id: number; name: string; email: string };

type EventRow = {
  id: number;
  kind: string;
  method: string | null;
  attemptedIdentifier: string | null;
  detail: string;
  createdAt: string;
  actorName: string | null;
};

const BLANK: AccountDraft = {
  name: '',
  email: '',
  role: 'ta',
  isTeamLead: false,
  interviewerDuty: false,
  accessUntil: null,
  resourceId: null,
  active: true,
};

/** SQLite's CURRENT_TIMESTAMP is UTC without a zone marker. */
function parseStamp(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
}

function formatWhen(s: string | null): string {
  if (!s) return '—';
  const d = parseStamp(s);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const STATUS_TONE: Record<PersonStatus, Tone> = {
  deactivated: 'rose',
  ended: 'amber',
  link_sent: 'blue',
  ok: 'green',
};

function status(p: PersonRow): { label: string; tone: Tone } {
  const s = personStatus(p);
  return { label: PERSON_STATUS_LABELS[s], tone: STATUS_TONE[s] };
}

type ExportLogRow = {
  id: number;
  actorName: string;
  list: string;
  mode: 'filtered' | 'ticked';
  fields: string[];
  filters: Record<string, string>;
  rowCount: number;
  createdAt: string;
};

function describeFilters(f: Record<string, string>): string {
  const parts = Object.entries(f).map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(' · ') : 'no filters';
}

const EVENT_LABELS: Record<string, string> = {
  account_created: 'Account created',
  account_updated: 'Account changed',
  account_deactivated: 'Deactivated',
  account_reactivated: 'Reactivated',
  link_sent: 'Password link sent',
  link_failed: 'Password link failed to send',
  password_set: 'Password set from link',
  password_changed: 'Password changed',
  sign_in: 'Signed in',
  sign_in_failed: 'Sign-in refused',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  role: 'Role',
  isTeamLead: 'Head',
  interviewerDuty: 'Interviewer duty',
  accessUntil: 'Access until',
  resourceId: 'Resource',
};

function describe(e: EventRow): string {
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(e.detail);
  } catch {
    /* an unreadable detail still shows the event itself */
  }
  const parts: string[] = [];
  if (e.method && e.kind.startsWith('sign_in')) parts.push(e.method === 'google' ? 'with Google' : 'with password');
  if (e.kind === 'account_updated' && detail.changes && typeof detail.changes === 'object') {
    for (const [k, v] of Object.entries(detail.changes as Record<string, { before: unknown; after: unknown }>)) {
      const show = (x: unknown) =>
        x === null || x === '' ? '—' : k === 'role' ? ROLE_LABELS[x as Role] ?? String(x) : String(x);
      parts.push(`${FIELD_LABELS[k] ?? k}: ${show(v.before)} → ${show(v.after)}`);
    }
  }
  if (typeof detail.to === 'string') parts.push(`to ${detail.to}`);
  if (typeof detail.reason === 'string') parts.push(detail.reason.replace(/_/g, ' '));
  if (e.attemptedIdentifier) parts.push(`as ${e.attemptedIdentifier}`);
  return parts.join(' · ');
}

export default function PeopleClient({
  initial,
  resources,
  canEdit,
  viewerId,
  mailReady,
  canExport,
}: {
  initial: PersonRow[];
  resources: ResourceOption[];
  canEdit: boolean;
  viewerId: number;
  mailReady: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [form, setForm] = useState<AccountDraft>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const [logFor, setLogFor] = useState<PersonRow | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const filters: PeopleFilters = useMemo(() => ({ search, role: roleFilter }), [search, roleFilter]);
  const filtered = useMemo(() => peopleList.filterRows(initial, filters), [initial, filters]);
  const { ticks, toggle, setMany } = useTicks();

  const [exportLogOpen, setExportLogOpen] = useState(false);
  const [exportLog, setExportLog] = useState<ExportLogRow[] | null>(null);
  const [exportLogError, setExportLogError] = useState<string | null>(null);

  async function openExportLog() {
    setExportLogOpen(true);
    setExportLog(null);
    setExportLogError(null);
    try {
      setExportLog(await api<ExportLogRow[]>('/api/exports'));
    } catch (e) {
      setExportLogError(errorMessage(e));
    }
  }

  useEffect(() => setPage(1), [search, roleFilter]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    [filtered, page],
  );

  // A resource can hold one login (R3): offer only the free ones, plus the
  // one this account already has.
  const resourceOptions = useMemo(() => {
    const taken = new Set(initial.filter((p) => p.id !== editing?.id && p.resourceId).map((p) => p.resourceId));
    return resources
      .filter((r) => !taken.has(r.id))
      .map((r) => ({ value: String(r.id), label: r.name, detail: r.email }));
  }, [resources, initial, editing]);

  function openCreate() {
    setEditing(null);
    setForm(BLANK);
    setErrors({});
    setBanner(null);
    setConfirmDeactivate(false);
    setOpen(true);
  }

  function openEdit(p: PersonRow) {
    setEditing(p);
    setForm({
      name: p.name,
      email: p.email ?? '',
      role: p.role,
      isTeamLead: p.isTeamLead,
      interviewerDuty: p.interviewerDuty,
      accessUntil: p.accessUntil,
      resourceId: p.resourceId,
      active: p.active,
    });
    setErrors({});
    setBanner(null);
    setConfirmDeactivate(false);
    setOpen(true);
  }

  async function submit(next: AccountDraft) {
    // The same rules the API applies, so most mistakes show before a round trip.
    const local = checkAccount({ input: next, current: editing, actorId: viewerId, accounts: initial });
    if (!local.ok) {
      setErrors(local.fields);
      setBanner(local.message);
      return false;
    }
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      if (editing) {
        await api(`/api/users/${editing.id}`, { method: 'PUT', json: next });
      } else {
        await api('/api/users', { method: 'POST', json: next });
      }
      return true;
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (await submit(form)) {
      setOpen(false);
      setNotice(
        editing
          ? `Saved ${form.name}.`
          : `Added ${form.name}. Send them a link so they can set a password, or they can use Sign in with Google.`,
      );
      router.refresh();
    }
  }

  async function setActive(active: boolean) {
    if (await submit({ ...form, active })) {
      setOpen(false);
      setNotice(active ? `Reactivated ${form.name}.` : `Deactivated ${form.name}. They are signed out on their next click.`);
      router.refresh();
    }
  }

  async function sendLink(p: PersonRow) {
    setNotice(null);
    setBanner(null);
    try {
      const r = (await api(`/api/users/${p.id}/send-link`, { method: 'POST' })) as { to: string };
      setNotice(`Password link sent to ${r.to}. It works once, for 72 hours.`);
      router.refresh();
    } catch (e) {
      // Shown on the page, not only in the dialog: a failed send must never
      // look like it went (R18).
      setNotice(null);
      setBanner(`Not sent: ${errorMessage(e)}`);
    }
  }

  async function openLog(p: PersonRow) {
    setLogFor(p);
    setEvents(null);
    setLogError(null);
    try {
      setEvents((await api(`/api/users/${p.id}/events`)) as EventRow[]);
    } catch (e) {
      setLogError(errorMessage(e));
    }
  }

  const role = form.role;
  const isSelf = editing?.id === viewerId;
  const sendable = (p: PersonRow) => mailReady && p.active && p.canSignInNow && Boolean(p.email);

  return (
    <div className="pb-12">
      <PageHeader
        title="People"
        subtitle={`${initial.filter((p) => p.active).length} active logins${canEdit ? '' : ' · view only'}`}
        action={
          <div className="flex gap-2">
            {canExport && (
              <>
                <button className="btn-ghost" onClick={openExportLog}>
                  <FileClock className="h-4 w-4" /> Export log
                </button>
                <ExportButton
                  def={peopleList}
                  endpoint="/api/users/export"
                  filters={filters}
                  filteredCount={filtered.length}
                  ticks={ticks}
                />
              </>
            )}
            {canEdit && (
              <button className="btn-primary" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add person
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-56 max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | '')}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {(search || roleFilter) && (
          <button
            className="inline-flex items-center gap-1 text-xs text-ink3 hover:text-ink"
            onClick={() => {
              setSearch('');
              setRoleFilter('');
            }}
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {(notice || (banner && !open)) && (
        <div className="px-6 pb-3">
          <div
            className={
              notice
                ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                : 'rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
            }
          >
            {notice ?? banner}
          </div>
        </div>
      )}

      {canEdit && !mailReady && (
        <div className="px-6 pb-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Email is not configured on this server, so password links cannot be sent. People with a Google account
            can still use Sign in with Google.
          </div>
        </div>
      )}

      <div className="px-6">
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title={initial.length ? 'No matching people' : 'No logins yet'}
              description={initial.length ? 'Try a different search, or clear the role filter.' : undefined}
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  {canExport && (
                    <TickAllHeader ids={pageItems.map((p) => p.id)} ticks={ticks} setMany={setMany} />
                  )}
                  <th className="th">Person</th>
                  <th className="th">Role</th>
                  <th className="th">Status</th>
                  <th className="th">Last sign-in</th>
                  {canEdit && <th className="th w-28 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((p) => {
                  const s = status(p);
                  return (
                    <tr key={p.id} className="hover:bg-surface2/50">
                      {canExport && <TickCell id={p.id} label={p.name} ticks={ticks} toggle={toggle} />}
                      <td className="td">
                        <div className="font-medium text-ink">{p.name}</div>
                        <div className="text-2xs text-ink3">
                          {p.email ?? (
                            <span>
                              No email yet · signs in as <span className="font-mono">{p.username}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-sm text-ink">{ROLE_LABELS[p.role]}</span>
                          {p.isTeamLead && <Badge tone="violet">Head</Badge>}
                          {p.interviewerDuty && <Badge tone="neutral">Panel</Badge>}
                        </div>
                        {p.resourceName && <div className="text-2xs text-ink3">{p.resourceName}</div>}
                      </td>
                      <td className="td">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {p.accessUntil && (
                          <div className="mt-0.5 text-2xs text-ink3">until {formatDate(p.accessUntil)}</div>
                        )}
                      </td>
                      <td className="td tnum text-sm text-ink2">{formatWhen(p.lastSignInAt)}</td>
                      {canEdit && (
                        <td className="td text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => sendLink(p)}
                              disabled={!sendable(p)}
                              title={sendable(p) ? 'Email a link to set a password' : 'Needs a real email, an active account and mail set up'}
                              className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Send ${p.name} a password link`}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openLog(p)}
                              className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                              aria-label={`Account log for ${p.name}`}
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openEdit(p)}
                              className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                              aria-label={`Edit ${p.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
          {filtered.length > 0 && (
            <Pagination page={page} pageSize={LIST_PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          )}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add person'}
        description={
          editing
            ? 'Role, head, panel duty, email and deactivation take effect on their next click.'
            : 'They sign in with this email: through Google, or with a password set from the link you send.'
        }
      >
        <div className="space-y-3">
          {banner && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {banner}
            </div>
          )}
          <Field label="Name" required error={errors.name}>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field
            label="Email"
            required={!editing || Boolean(editing.email)}
            error={errors.email}
            hint={editing && !editing.email ? `Until an email is added, ${editing.username} signs in by username.` : undefined}
          >
            <input
              className="input"
              type="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Role" required error={errors.role}>
            <select
              className="input"
              value={role}
              disabled={isSelf && editing?.role === 'admin'}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>

          {TEAM_ROLES.includes(role) && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.isTeamLead}
                onChange={(e) => setForm({ ...form, isTeamLead: e.target.checked })}
              />
              Head of {ROLE_LABELS[role]} (sees the team&apos;s work)
            </label>
          )}

          {role !== 'interviewer' && (
            <div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.interviewerDuty}
                  onChange={(e) => setForm({ ...form, interviewerDuty: e.target.checked })}
                />
                Also sits on interview panels
              </label>
              {errors.interviewerDuty && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.interviewerDuty}</p>
              )}
            </div>
          )}

          {role === 'resource' && (
            <Field label="Resource" required error={errors.resourceId} hint="Each resource can have one login.">
              <Combobox
                value={form.resourceId ? String(form.resourceId) : ''}
                onChange={(v) => setForm({ ...form, resourceId: v ? Number(v) : null })}
                options={resourceOptions}
                placeholder="Search resources…"
                emptyLabel="No resource without a login matches"
                invalid={Boolean(errors.resourceId)}
              />
            </Field>
          )}

          <Field
            label="Access until"
            required={role === 'interviewer'}
            error={errors.accessUntil}
            hint={
              role === 'interviewer'
                ? 'Outside interviewers stop working at the end of this day (India time).'
                : 'Optional. Leave blank for no end date.'
            }
          >
            <input
              className="input"
              type="date"
              value={form.accessUntil ?? ''}
              onChange={(e) => setForm({ ...form, accessUntil: e.target.value || null })}
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <div>
              {editing &&
                (editing.active ? (
                  confirmDeactivate ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink2">Deactivate {editing.name}?</span>
                      <button className="btn-danger" disabled={saving} onClick={() => setActive(false)}>
                        Deactivate
                      </button>
                      <button className="btn-ghost" onClick={() => setConfirmDeactivate(false)}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-ghost text-rose-600 dark:text-rose-400"
                      disabled={saving || isSelf}
                      title={isSelf ? 'You cannot deactivate your own account' : undefined}
                      onClick={() => setConfirmDeactivate(true)}
                    >
                      Deactivate
                    </button>
                  )
                ) : (
                  <button className="btn-ghost" disabled={saving} onClick={() => setActive(true)}>
                    Reactivate
                  </button>
                ))}
            </div>
            {!confirmDeactivate && (
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button className="btn-primary" disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : editing ? 'Save' : 'Add person'}
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(logFor)}
        onClose={() => setLogFor(null)}
        title={logFor ? `Account log · ${logFor.name}` : 'Account log'}
        description="Newest first. Times are in your local time."
        wide
      >
        {logError ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{logError}</p>
        ) : !events ? (
          <p className="text-sm text-ink3">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-ink3">Nothing logged for this account yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-ink">{EVENT_LABELS[e.kind] ?? e.kind}</div>
                  {describe(e) && <div className="text-2xs text-ink3">{describe(e)}</div>}
                </div>
                <div className="tnum text-2xs text-ink3">
                  {formatWhen(e.createdAt)}
                  {e.actorName && ` · by ${e.actorName}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={exportLogOpen}
        onClose={() => setExportLogOpen(false)}
        title="Export log"
        description="Every CSV download from any list, newest first. Times are in your local time."
        wide
      >
        {exportLogError ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{exportLogError}</p>
        ) : !exportLog ? (
          <p className="text-sm text-ink3">Loading…</p>
        ) : exportLog.length === 0 ? (
          <p className="text-sm text-ink3">Nothing has been exported yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {exportLog.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-ink">
                    <span className="capitalize">{e.list}</span> · {e.rowCount} row{e.rowCount === 1 ? '' : 's'} ·{' '}
                    {e.mode === 'ticked' ? 'ticked rows' : describeFilters(e.filters)}
                  </div>
                  <div className="text-2xs text-ink3">
                    {e.fields.length} field{e.fields.length === 1 ? '' : 's'}: {e.fields.join(', ')}
                  </div>
                </div>
                <div className="tnum text-2xs text-ink3">
                  {formatWhen(e.createdAt)} · by {e.actorName}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
