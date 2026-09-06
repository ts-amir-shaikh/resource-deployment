/**
 * Bulk-import real data from CSV into resources, clients, projects,
 * candidates, or deployments (mappings). Dry-run by default — validates
 * every row and reports exactly what would happen, without writing anything.
 *
 *   npm run db:import -- <entity> <file.csv> [--commit] [--update]
 *
 *   --commit   actually write to the database (omit for a dry run)
 *   --update   when a row matches an existing record, update it instead of
 *              leaving it unchanged
 *
 * Column templates live in scripts/import/templates/.
 *
 * Agreements, invoices, and opportunities are intentionally not covered
 * here — they carry cross-row rules (the agreement renewal chain, the
 * forward-only invoice lifecycle) that are safer created through the app,
 * which enforces those rules per write. Deployments ARE covered: the 100%
 * allocation cap is re-implemented in scripts/import/deployments.ts so a
 * bulk mapping import can't silently over-allocate a resource.
 *
 * Import order: clients → projects → resources → deployments (mappings).
 * Deployments can optionally reference an agreementNumber, but that's not
 * required — leave it blank for a deployment with no PO yet.
 */
import { getClient, targetLabel } from './import/lib';
import { importResources } from './import/resources';
import { importClients } from './import/clients';
import { importProjects } from './import/projects';
import { importCandidates } from './import/candidates';
import { importDeployments } from './import/deployments';

const IMPORTERS = {
  resources: importResources,
  clients: importClients,
  projects: importProjects,
  candidates: importCandidates,
  deployments: importDeployments,
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
  npm run db:import -- deployments my-mappings.csv --commit

Import order matters: clients before projects, resources before candidates
or deployments that link to them by email, and projects before deployments.
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
