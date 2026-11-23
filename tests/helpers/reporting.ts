import { sha256Hex } from '@/lib/reporting/verify';
import type { ReportingScope } from '@/lib/reporting/paths';

/** A token in the real format (rpt_ + 43 base64url characters) and its hash. Test data only. */
export async function makeToken(seed = 'a') {
  const token = `rpt_${seed.repeat(43).slice(0, 43)}`;
  return { token, sha256: await sha256Hex(token) };
}

/** A REPORTING_TOKENS value holding one token. */
export async function tokenEnv(opts: {
  id?: string;
  seed?: string;
  scopes?: ReportingScope[];
  expires?: string;
}) {
  const { token, sha256 } = await makeToken(opts.seed ?? 'a');
  const raw = JSON.stringify([
    {
      id: opts.id ?? 'test-token',
      sha256,
      scopes: opts.scopes ?? ['billing', 'invoices', 'capacity', 'pipeline', 'renewals'],
      expires: opts.expires ?? '2099-12-31',
    },
  ]);
  return { token, raw };
}
