'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { ListDef } from '@/lib/lists/types';
import { Modal } from '@/components/ui';
import { cn } from '@/lib/utils';

/* ── Ticked rows ───────────────────────────────────────────── */

/**
 * Ticks that survive paging: a Set of row ids held above the table, so a tick
 * on page 1 is still there after visiting page 3. Filters do not clear it —
 * "Ticked rows" exports exactly what was ticked, wherever it now sits.
 */
export function useTicks() {
  const [ticks, setTicks] = useState<Set<number>>(() => new Set());

  const toggle = useCallback((id: number, on: boolean) => {
    setTicks((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: number[], on: boolean) => {
    setTicks((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setTicks(new Set()), []);

  return { ticks, setTicks, toggle, setMany, clear };
}

const BOX = 'h-3.5 w-3.5 rounded border-line accent-[rgb(var(--accent))]';

/** Header checkbox: ticks or unticks every row on the current page. */
export function TickAllHeader({
  ids,
  ticks,
  setMany,
}: {
  ids: number[];
  ticks: Set<number>;
  setMany: (ids: number[], on: boolean) => void;
}) {
  const all = ids.length > 0 && ids.every((id) => ticks.has(id));
  return (
    <th className="th w-10">
      <input
        type="checkbox"
        aria-label="Tick every row on this page"
        className={BOX}
        checked={all}
        onChange={(e) => setMany(ids, e.target.checked)}
      />
    </th>
  );
}

export function TickCell({
  id,
  label,
  ticks,
  toggle,
  disabled,
}: {
  id: number;
  label: string;
  ticks: Set<number>;
  toggle: (id: number, on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <td className="td">
      <input
        type="checkbox"
        aria-label={`Tick ${label}`}
        className={BOX}
        disabled={disabled}
        checked={ticks.has(id)}
        onChange={(e) => toggle(id, e.target.checked)}
      />
    </td>
  );
}

/* ── Export button and dialog ──────────────────────────────── */

/** Remembered per list in this browser only (R8) — a convenience, not state. */
function prefKey(list: string) {
  return `export-fields:${list}`;
}

function loadFields(list: string, allowed: string[], fallback: string[]): string[] {
  try {
    const raw = window.localStorage.getItem(prefKey(list));
    if (!raw) return fallback;
    const saved = (JSON.parse(raw) as unknown[]).filter(
      (k): k is string => typeof k === 'string' && allowed.includes(k),
    );
    return saved.length ? saved : fallback;
  } catch {
    return fallback;
  }
}

function saveFields(list: string, fields: string[]) {
  try {
    window.localStorage.setItem(prefKey(list), JSON.stringify(fields));
  } catch {
    // Private window or blocked storage — the choice just isn't remembered.
  }
}

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get('Content-Disposition') ?? '';
  return /filename="([^"]+)"/.exec(cd)?.[1] ?? fallback;
}

/**
 * The Export button for a list header, and the dialog it opens.
 *
 * Downloads through fetch rather than a plain link: a link would save a JSON
 * error ("signed out", "unknown field") as the CSV. Here the status is checked
 * first, a failure is shown in the dialog, and only a 200 becomes a file (R11).
 */
export function ExportButton<Row extends { id: number }, Filters>({
  def,
  endpoint,
  filters,
  filteredCount,
  ticks,
}: {
  def: ListDef<Row, Filters>;
  /** e.g. `/api/resources/export` */
  endpoint: string;
  /** The screen's current filter state, in the list's own shape. */
  filters: Filters;
  filteredCount: number;
  ticks: Set<number>;
}) {
  const allKeys = def.columns.map((c) => c.key);
  const defaults = def.columns.filter((c) => c.defaultOn).map((c) => c.key);

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Set<string>>(() => new Set(defaults));
  const [mode, setMode] = useState<'filtered' | 'ticked'>('filtered');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFields(new Set(loadFields(def.list, allKeys, defaults)));
    setMode(ticks.size > 0 ? 'ticked' : 'filtered');
    setError(null);
    // Re-read only when the dialog opens; the lists are static per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleField(key: string, on: boolean) {
    const next = new Set(fields);
    if (on) next.add(key);
    else next.delete(key);
    setFields(next);
  }

  async function download() {
    setError(null);
    const chosen = allKeys.filter((k) => fields.has(k));
    if (!chosen.length) return setError('Choose at least one field to export.');
    if (mode === 'ticked' && !ticks.size) return setError('Tick at least one row first.');

    const params = new URLSearchParams(
      mode === 'ticked' ? {} : def.toParams(filters),
    );
    params.set('fields', chosen.join(','));
    params.set('mode', mode);
    if (mode === 'ticked') params.set('ids', [...ticks].join(','));

    setBusy(true);
    try {
      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        // Same handling as lib/client.ts: a changed session reloads, an ended
        // one goes to sign-in — but the message is shown first either way.
        if (res.status === 401 && payload?.sessionChanged) window.location.reload();
        else if (res.status === 401 && payload?.signedOut) window.location.assign('/login');
        setError(payload?.error ?? `Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFrom(res, `${def.list}.csv`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      saveFields(def.list, chosen);
      setOpen(false);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" /> Export
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Export to CSV"
        description="Choose the rows and fields to include. Every export is logged."
      >
        <div className="space-y-5">
          <fieldset>
            <legend className="label">Rows</legend>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="export-mode"
                  checked={mode === 'filtered'}
                  onChange={() => setMode('filtered')}
                />
                All rows matching the current filters
                <span className="tnum text-ink3">({filteredCount})</span>
              </label>
              <label
                className={cn(
                  'flex items-center gap-2 text-sm',
                  ticks.size ? 'text-ink' : 'text-ink3',
                )}
              >
                <input
                  type="radio"
                  name="export-mode"
                  disabled={!ticks.size}
                  checked={mode === 'ticked'}
                  onChange={() => setMode('ticked')}
                />
                Ticked rows only
                <span className="tnum text-ink3">({ticks.size})</span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <div className="mb-1.5 flex items-center justify-between">
              <legend className="label mb-0">
                Fields <span className="tnum text-ink3">({fields.size} of {allKeys.length})</span>
              </legend>
              <div className="flex gap-3 text-xs">
                <button className="text-brand hover:underline" onClick={() => setFields(new Set(allKeys))}>
                  All
                </button>
                <button className="text-brand hover:underline" onClick={() => setFields(new Set())}>
                  None
                </button>
                <button
                  className="text-brand hover:underline"
                  onClick={() => setFields(new Set(defaults))}
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="grid max-h-72 grid-cols-1 gap-x-4 gap-y-1.5 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-2">
              {def.columns.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className={BOX}
                    checked={fields.has(c.key)}
                    onChange={(e) => toggleField(c.key, e.target.checked)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={download} disabled={busy}>
              <Download className="h-4 w-4" /> {busy ? 'Preparing…' : 'Download CSV'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
