/**
 * Bulk-import real data from CSV into resources, clients, projects, or
 * candidates. Dry-run by default — validates every row and reports exactly
 * what would happen, without writing anything.
 *
 *   npm run db:import -- <entity> <file.csv> [--commit] [--update]
 *
 *   --commit   actually write to the database (omit for a dry run)
 *   --update   when a row matches an existing record, update it instead of
 *              leaving it unchanged
 *
 * Column templates live in scripts/import/templates/.
 *
 * Deployments, agreements, invoices, and opportunities are intentionally not
 * covered here — they carry cross-row rules (the 100% allocation cap, the
 * agreement renewal chain, the forward-only invoice lifecycle) that are safer
 * created through the app, which enforces those rules per write. This script
 * covers the master data that other records reference.
 */
import { getClient, targetLabel } from './import/lib';
import { importResources } from './import/resources';
import { importClients } from './import/clients';
import { importProjects } from './import/projects';
import { importCandidates } from './import/candidates';

const IMPORTERS = {
  resources: importResources,
  clients: importClients,
  projects: importProjects,
  candidates: importCandidates,
} as const;

type Entity = keyof typeof IMPORTERS;

function usage(): never {
  console.log(`
Bulk import from CSV.

  npm run db:import -- <entity> <file.csv> [--commit] [--update]

Entities:  ${Object.keys(IMPORTERS).join(', ')}

  --commit   write to the database (default: dry run — validate and report only)
  --update   update existing records instead of skipping them

Column templates: scripts/import/templates/<entity>.csv

Examples:
  npm run db:import -- resources my-resources.csv
  npm run db:import -- resources my-resources.csv --commit
  npm run db:import -- clients my-clients.csv --commit --update

Import order matters: clients before projects, and resources before
candidates if candidates.csv links to bench resources by email.
`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const [entity, file] = args;
  const commit = args.includes('--commit');
  const update = args.includes('--update');

  if (!entity || !file || !(entity in IMPORTERS)) usage();

  console.log(`Target database: ${targetLabel()}`);
  const client = getClient();
  try {
    await IMPORTERS[entity as Entity](client, file, { commit, update });
  } finally {
    client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
