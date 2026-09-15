import { SOURCE_LABELS } from '@/lib/utils';
import type { SourceRow } from '@/lib/queries';
import { DetailSection, DetailEmpty } from '@/components/detail';
import { TableShell } from '@/components/ui';

/**
 * Where the people who actually joined came from — as a rate, not just a
 * count, because the biggest channel and the best channel are rarely the
 * same one. Rendered on the back-office dashboard and the lead's team view.
 */
export default function SourceEffectiveness({ rows }: { rows: SourceRow[] }) {
  const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
  return (
    <DetailSection
      title="Source effectiveness"
      hint="Per channel: how many were put forward, reached a client, and joined. Counted per person, not per requirement."
    >
      {rows.length === 0 ? (
        <DetailEmpty>No candidates recorded yet.</DetailEmpty>
      ) : (
        <TableShell>
          <thead className="border-b border-line bg-surface2">
            <tr>
              <th className="th">Source</th>
              <th className="th text-right">Candidates</th>
              <th className="th text-right">Put forward</th>
              <th className="th text-right">Reached client</th>
              <th className="th text-right">Joined</th>
              <th className="th text-right">Join rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.source}>
                <td className="td font-medium text-ink">{SOURCE_LABELS[r.source] ?? r.source}</td>
                <td className="td tnum text-right text-ink2">{r.candidates}</td>
                <td className="td tnum text-right text-ink2">
                  {r.mapped} <span className="text-2xs text-ink3">{pct(r.mapped, r.candidates)}</span>
                </td>
                <td className="td tnum text-right text-ink2">
                  {r.submitted} <span className="text-2xs text-ink3">{pct(r.submitted, r.candidates)}</span>
                </td>
                <td className="td tnum text-right font-medium text-ink">{r.joined}</td>
                <td className="td tnum text-right text-ink2">{pct(r.joined, r.candidates)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </DetailSection>
  );
}
