'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A type-to-filter replacement for a native <select> over a list of rows.
 *
 * Only for entity-backed pickers — resources, projects, candidates and the
 * like — which grow as the business does. Fixed enums (currency, stage, work
 * mode) keep their native select: six known values is exactly what that
 * control is for, and filtering them would be slower, not faster.
 *
 * The contract is deliberately the same as the select it replaces: a string
 * `value` in, `onChange(value)` out, '' meaning nothing picked. Call sites keep
 * their existing form state and handler, so conversion is mechanical and can
 * stop halfway without leaving the app in two styles of half-built picker.
 *
 * `label` is what the option shows; `search` is what typing matches against,
 * defaulting to the label. They differ where an option carries formatting a
 * person would never type — "Priya Nair — 40% free · ₹1,80,000/mo" matches on
 * the name and skill, not on the rupee figure.
 *
 * Rendered inline rather than through a portal: the app's Modal is a relative
 * dialog inside a `fixed inset-0 overflow-y-auto` overlay and sets no overflow
 * of its own, so an absolutely-positioned panel is neither clipped nor stacked
 * behind anything. A portal would drag positioning and focus handling along
 * with it for no gain.
 */

export type ComboOption = {
  value: string;
  /** What the row reads as. Plain text unless `search` is given. */
  label: string;
  /** Secondary line, shown dimmer under the label. */
  detail?: string;
  /** What typing matches against. Defaults to label + detail. */
  search?: string;
  /** Optional heading this option sits under, e.g. 'Clients' / 'Prospects'. */
  group?: string;
};

function matches(o: ComboOption, q: string) {
  const hay = (o.search ?? `${o.label} ${o.detail ?? ''}`).toLowerCase();
  // Every whitespace-separated term must appear, so "priya react" finds a
  // React developer named Priya regardless of field order.
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  emptyLabel = 'No matches',
  disabled,
  clearable = true,
  id,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  /** Shown when the filter matches nothing. */
  emptyLabel?: string;
  disabled?: boolean;
  /** Whether '' is reachable once something is picked. */
  clearable?: boolean;
  id?: string;
  invalid?: boolean;
}) {
  const reactId = useId();
  const listId = `${id ?? reactId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  // While closed the input shows the selection; while open it shows what is
  // being typed, so opening never looks like the value was wiped.
  const shown = open ? query : (selected?.label ?? '');

  const filtered = useMemo(() => {
    if (!open || !query.trim()) return options;
    return options.filter((o) => matches(o, query));
  }, [options, query, open]);

  // Close on an outside click. Pointerdown rather than click so a press that
  // starts outside dismisses immediately instead of on release.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing past the visible window.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function openWith(q: string) {
    setQuery(q);
    setOpen(true);
    // Start on the current selection so Enter without typing is a no-op
    // rather than a silent change to whatever sits at the top.
    const at = q ? 0 : Math.max(0, options.findIndex((o) => o.value === value));
    setActive(at);
  }

  function choose(o: ComboOption) {
    onChange(o.value);
    setOpen(false);
    setQuery('');
  }

  function clear() {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openWith('');
      if (!filtered.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + filtered.length) % filtered.length);
      return;
    }
    if (e.key === 'Home' && open) {
      e.preventDefault();
      setActive(0);
      return;
    }
    if (e.key === 'End' && open) {
      e.preventDefault();
      setActive(filtered.length - 1);
      return;
    }
    if (e.key === 'Enter') {
      if (!open) return;
      // Inside a modal Enter would otherwise reach the form behind and submit
      // it while the list is still open.
      e.preventDefault();
      const o = filtered[active];
      if (o) choose(o);
      return;
    }
    if (e.key === 'Escape') {
      if (!open) return;
      e.preventDefault();
      e.stopPropagation(); // …or the modal itself closes behind the list.
      setOpen(false);
      setQuery('');
      return;
    }
    if (e.key === 'Tab' && open) {
      setOpen(false);
      setQuery('');
    }
  }

  // Group headings are emitted as the list is walked, so an option's index
  // still lines up with `filtered` for the keyboard.
  let lastGroup: string | undefined;

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered[active] ? `${listId}-${active}` : undefined
          }
          aria-invalid={invalid || undefined}
          autoComplete="off"
          disabled={disabled}
          className={cn('input pr-14', invalid && 'border-rose-400')}
          placeholder={selected ? selected.label : placeholder}
          value={shown}
          onChange={(e) => openWith(e.target.value)}
          onFocus={() => !open && openWith('')}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
          {clearable && value !== '' && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={clear}
              aria-label="Clear selection"
              className="rounded p-0.5 text-ink3 hover:bg-surface2 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={open ? 'Close list' : 'Open list'}
            onClick={() => {
              if (open) {
                setOpen(false);
                setQuery('');
              } else {
                openWith('');
                inputRef.current?.focus();
              }
            }}
            className="rounded p-0.5 text-ink3 hover:text-ink"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink3">{emptyLabel}</li>
          )}
          {filtered.map((o, i) => {
            const heading = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.value || `blank-${i}`}>
                {heading && (
                  <div className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-ink3">
                    {heading}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  onPointerDown={(e) => {
                    e.preventDefault(); // keep focus in the input
                    choose(o);
                  }}
                  onPointerEnter={() => setActive(i)}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm',
                    i === active ? 'bg-surface2 text-ink' : 'text-ink2',
                  )}
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-3.5 w-3.5 shrink-0',
                      o.value === value ? 'text-brand' : 'invisible',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.detail && (
                      <span className="block truncate text-xs text-ink3">
                        {o.detail}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Combobox;
