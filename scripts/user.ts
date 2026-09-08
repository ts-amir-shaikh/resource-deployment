/**
 * Creates and manages the accounts that sign in to the app.
 *
 *   npm run db:user -- --list
 *   npm run db:user -- --create --name "Mamta" --username mamta --role ta
 *   npm run db:user -- --create --name "Priya" --username priya --role ta --lead
 *   npm run db:user -- --lead    --username mamta      grant team-lead
 *   npm run db:user -- --no-lead --username mamta      revoke it
 *   npm run db:user -- --reset  --username mamta
 *   npm run db:user -- --role   --username mamta --set admin
 *   npm run db:user -- --disable --username mamta
 *   npm run db:user -- --enable  --username mamta
 *
 * The password is always typed at the prompt, never passed as a flag: a flag
 * lands in shell history and in the process list, where anyone on the machine
 * can read it. Input is masked, and only the PBKDF2 hash and its salt are
 * stored — the password itself is never written anywhere.
 *
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN when set, otherwise targets the
 * local development file.
 */
import { createClient } from '@libsql/client';
import * as readline from 'node:readline/promises';
import { hashPassword, newSalt, ROLES, type Role } from '../lib/auth';

const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Collects the new password twice and checks the two match.
 *
 * Two input paths, because Node's readline never resolves a pending question
 * once stdin hits EOF — piping into the interactive prompt would hang, then
 * exit 0 having created nothing, which is the worst possible outcome for a
 * script someone might automate. So a pipe is read whole and split, and only
 * a real terminal gets the masked prompt.
 */
async function askPasswordTwice(): Promise<string> {
  const [first, second] = process.stdin.isTTY
    ? await promptTwice()
    : await readTwoLinesFromPipe();

  if (first.length < 10) {
    console.error('\nToo short — use at least 10 characters. Nothing was changed.');
    process.exit(1);
  }
  if (first !== second) {
    console.error('\nPasswords did not match. Nothing was changed.');
    process.exit(1);
  }
  return first;
}

/** Interactive path: echo suppressed so the password never hits the screen. */
async function promptTwice(): Promise<[string, string]> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const masked = rl as unknown as { _writeToOutput?: (s: string) => void };

  async function ask(prompt: string): Promise<string> {
    masked._writeToOutput = () => {};
    process.stdout.write(prompt);
    const answer = await rl.question('');
    process.stdout.write('\n');
    return answer;
  }

  try {
    return [await ask('New password (min 10 chars): '), await ask('Confirm password: ')];
  } finally {
    rl.close();
  }
}

/**
 * Non-interactive path: the password twice, one per line. Note this puts the
 * password wherever the calling command lives — use it for automation you
 * already trust with secrets, not from an interactive shell.
 */
async function readTwoLinesFromPipe(): Promise<[string, string]> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);

  if (lines.length < 2 || !lines[0]) {
    console.error(
      '\nstdin is not a terminal, so the password was expected on stdin:\n' +
        '  printf \'%s\\n%s\\n\' "$PW" "$PW" | npm run db:user -- --create …\n' +
        'Nothing was changed.',
    );
    process.exit(1);
  }
  return [lines[0], lines[1]];
}

function parseRole(value: string | undefined, fallback?: Role): Role {
  if (!value) {
    if (fallback) return fallback;
    console.error(`\n--role is required. One of: ${ROLES.join(', ')}`);
    process.exit(1);
  }
  if (!ROLES.includes(value as Role)) {
    console.error(`\nUnknown role "${value}". One of: ${ROLES.join(', ')}`);
    process.exit(1);
  }
  return value as Role;
}

/**
 * Team lead is a flag on a TA, not a role of its own — a lead is a working
 * recruiter with the same access and the same commercial restrictions, who
 * additionally sees the team roll-up on /my. So it is meaningless on an admin
 * or management account, and setting it there is refused rather than stored
 * as a field nothing reads.
 */
function assertTaBeforeLead(role: string, username: string): void {
  if (role === 'ta') return;
  console.error(
    `\n"${username}" is ${role}, not ta. Team lead only applies to a TA account —` +
      `\nit adds the team roll-up to their own recruiter dashboard.` +
      `\nNothing was changed.`,
  );
  process.exit(1);
}

async function main() {
  const client = createClient({ url, authToken });
  const target = url.startsWith('file:') ? 'local file (data/deployment.db)' : 'Turso (remote)';

  const { rows: tables } = await client.execute(
    "select 1 from sqlite_master where type='table' and name='users'",
  );
  if (tables.length === 0) {
    console.error(`\nNo users table in ${target}. Run \`npm run db:migrate\` first.`);
    process.exit(1);
  }

  if (has('list') || process.argv.length <= 2) {
    const { rows } = await client.execute(
      'select id, name, username, role, active, is_team_lead from users order by role, username',
    );
    console.log(`\nAccounts in ${target}:`);
    if (rows.length === 0) {
      console.log(
        '  (none yet — the shared APP_PASSWORD still signs in as admin until\n' +
          '   the first account is created, then it stops working)',
      );
    }
    for (const r of rows) {
      const status = Number(r.active) ? '' : '  [disabled]';
      const lead = Number(r.is_team_lead) ? '  [team lead]' : '';
      console.log(
        `  ${String(r.username).padEnd(16)} ${String(r.role).padEnd(12)} ${r.name}${lead}${status}`,
      );
    }
    console.log('');
    client.close();
    return;
  }

  const username = (flag('username') || '').trim().toLowerCase();
  if (!username) {
    console.error('\n--username is required.');
    process.exit(1);
  }

  const { rows: existing } = await client.execute({
    sql: 'select id, name, role from users where lower(username) = ?',
    args: [username],
  });
  const found = existing[0];

  if (has('create')) {
    if (found) {
      console.error(`\nUser "${username}" already exists. Use --reset to change the password.`);
      process.exit(1);
    }
    const name = (flag('name') || '').trim();
    if (!name) {
      console.error('\n--name is required when creating a user.');
      process.exit(1);
    }
    const role = parseRole(flag('role'));
    const lead = has('lead');
    if (lead) assertTaBeforeLead(role, username);
    console.log(
      `\nCreating ${role}${lead ? ' team-lead' : ''} account "${username}" (${name}) in ${target}.`,
    );
    const password = await askPasswordTwice();
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    await client.execute({
      sql: `insert into users (name, username, password_hash, password_salt, role, is_team_lead, active)
            values (?, ?, ?, ?, ?, ?, 1)`,
      args: [name, username, hash, salt, role, lead ? 1 : 0],
    });
    console.log(
      `\nCreated. ${username} can now sign in as ${role}` +
        (lead ? ', and sees the whole team on /my.' : '.'),
    );
    client.close();
    return;
  }

  if (!found) {
    console.error(`\nNo user "${username}". Run with --list to see accounts.`);
    process.exit(1);
  }

  if (has('reset')) {
    console.log(`\nResetting password for "${username}" in ${target}.`);
    const password = await askPasswordTwice();
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    await client.execute({
      sql: 'update users set password_hash = ?, password_salt = ? where id = ?',
      args: [hash, salt, found.id],
    });
    console.log('\nPassword updated.');
  } else if (has('role')) {
    const role = parseRole(flag('set'));
    await client.execute({
      sql: 'update users set role = ? where id = ?',
      args: [role, found.id],
    });
    console.log(`\n${username} is now ${role}.`);
  } else if (has('lead') || has('no-lead')) {
    const grant = has('lead');
    if (grant) assertTaBeforeLead(String(found.role), username);
    await client.execute({
      sql: 'update users set is_team_lead = ? where id = ?',
      args: [grant ? 1 : 0, found.id],
    });
    console.log(
      grant
        ? `\n${username} is now a team lead — /my shows the whole team.`
        : `\n${username} is no longer a team lead.`,
    );
  } else if (has('disable') || has('enable')) {
    const active = has('enable') ? 1 : 0;
    await client.execute({
      sql: 'update users set active = ? where id = ?',
      args: [active, found.id],
    });
    console.log(`\n${username} is now ${active ? 'enabled' : 'disabled'}.`);
  } else {
    console.error('\nNothing to do. Pass one of --create, --reset, --role, --lead, --no-lead, --disable, --enable, --list.');
    process.exit(1);
  }

  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
