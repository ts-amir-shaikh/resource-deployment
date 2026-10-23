/**
 * Mock review and skill data for M67, so the Reviews and Skill Matrix screens
 * have something to show. Additive only:
 *
 * - reviews: does nothing if `performance_reviews` or `account_reviews`
 *   already has rows. Otherwise, for the deployments that already exist, the
 *   two months before last are approved (so trends have history), last month
 *   is a mix of approved and submitted, and this month has a few drafts and
 *   leaves the rest not started;
 * - skills: does nothing if `resource_skills` already has rows. Otherwise
 *   each resource gets levels on the catalogue skills matching the free-text
 *   skills on their record;
 * - never updates or deletes an existing row, and creates no accounts. The
 *   submitter is the first Resource Manager account and the approver the
 *   first Admin, or nobody when there is none.
 *
 *   npm run db:migrate          # first — the tables, criteria and catalogue must exist
 *   npm run db:seed-reviews
 *
 * Targets TURSO_DATABASE_URL when set, otherwise the local libSQL file.
 */
import { createClient } from '@libsql/client';
import { activeInPeriod, periodOf, shiftPeriod, skillKey } from '../lib/review-rules';

const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
const client = createClient({ url, authToken });

async function insert(sql: string, args: unknown[]): Promise<number> {
  const r = await client.execute({ sql, args: args.map((v) => (v === undefined ? null : v)) as never });
  return Number(r.lastInsertRowid ?? 0);
}

async function count(table: string): Promise<number> {
  return Number((await client.execute(`select count(*) c from ${table}`)).rows[0]?.c ?? 0);
}

async function firstUser(role: string): Promise<number | null> {
  const { rows } = await client.execute({ sql: 'select id from users where role = ? and active = 1 order by id limit 1', args: [role] });
  return rows.length ? Number(rows[0].id) : null;
}

const FEEDBACK = [
  'Very happy with the delivery this month. Picked up the new module quickly.',
  'Good work overall; would like more proactive status updates.',
  'Strong on the technical side. Occasionally late to stand-ups.',
  'Reliable and easy to work with. The team relies on them.',
];
const SUMMARIES = [
  'Steady month with on-time delivery.',
  'Settled into the team well; ramp-up complete.',
  'Took ownership of a production issue and closed it out.',
  'Solid month, a couple of missed timesheet days.',
];
const ACCOUNT_SUMMARIES = [
  'Relationship healthy; client signalled an extension.',
  'Stable. One escalation resolved within the week.',
  'Delivery fine, but budget pressure on their side — renewal at risk.',
];
const RATINGS = ['green', 'amber', 'green', 'red'] as const;

async function seedReviews() {
  if ((await count('performance_reviews')) > 0 || (await count('account_reviews')) > 0) {
    console.log('Reviews already exist — no reviews added.');
    return;
  }
  const criteria = (await client.execute('select id from review_criteria where active = 1 order by sort_order, id')).rows.map((r) => Number(r.id));
  if (criteria.length === 0) {
    console.error('There are no active review criteria. Run `npm run db:migrate` first.');
    return;
  }
  const { rows: deps } = await client.execute(`
    select d.id, d.resource_id, p.client_id, d.start_date, d.end_date, c.spoc_name
      from deployments d
      join projects p on p.id = d.project_id
      join clients c on c.id = p.client_id
     order by d.id`);
  if (deps.length === 0) {
    console.log('No deployments exist, so there is nothing to review.');
    return;
  }
  const rm = await firstUser('resource_manager');
  const admin = await firstUser('admin');

  const thisMonth = periodOf(new Date().toISOString().slice(0, 10));
  // [period, what happens to each review that month]
  const plan: [string, 'approved' | 'mixed' | 'current'][] = [
    [shiftPeriod(thisMonth, -3), 'approved'],
    [shiftPeriod(thisMonth, -2), 'approved'],
    [shiftPeriod(thisMonth, -1), 'mixed'],
    [thisMonth, 'current'],
  ];

  let perf = 0;
  let acct = 0;
  for (const [pi, [period, mode]] of plan.entries()) {
    const due = deps.filter((d) =>
      activeInPeriod({ startDate: String(d.start_date), endDate: d.end_date == null ? null : String(d.end_date) }, period),
    );
    const at = `${period}-28T10:00:00.000Z`;

    for (const [i, d] of due.entries()) {
      // This month: the first two are drafts, the next one submitted, the rest not started.
      if (mode === 'current' && i > 2) continue;
      const status = mode === 'approved' ? 'approved' : mode === 'mixed' ? (i % 3 === 2 ? 'submitted' : 'approved') : i < 2 ? 'draft' : 'submitted';
      const withFeedback = (i + pi) % 2 === 0;
      const id = await insert(
        `insert into performance_reviews (deployment_id, resource_id, client_id, period, status, summary, strengths, improvements,
                                          client_feedback, client_feedback_by, client_feedback_date,
                                          submitted_at, submitted_by_user_id, approved_at, approved_by_user_id, created_by_user_id, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id,
          d.resource_id,
          d.client_id,
          period,
          status,
          SUMMARIES[(i + pi) % SUMMARIES.length],
          status === 'draft' ? null : 'Ownership, clear written updates.',
          status === 'draft' ? null : 'Estimate more conservatively.',
          withFeedback ? FEEDBACK[(i + pi) % FEEDBACK.length] : null,
          withFeedback ? (d.spoc_name ? String(d.spoc_name) : 'Client SPOC') : null,
          withFeedback ? `${period}-25` : null,
          status === 'draft' ? null : at,
          status === 'draft' ? null : rm,
          status === 'approved' ? at : null,
          status === 'approved' ? admin : null,
          rm,
          at,
        ],
      );
      // Scores drift a little month to month so the trend has a shape. A
      // draft is left half-scored, as a real one in progress would be.
      for (const [ci, criterionId] of criteria.entries()) {
        if (status === 'draft' && ci >= 2) break;
        const score = Math.min(5, Math.max(1, 3 + ((i + ci + pi) % 3) - (ci === 2 && i % 4 === 3 ? 1 : 0)));
        await insert('insert into performance_review_scores (review_id, criterion_id, score) values (?, ?, ?)', [id, criterionId, score]);
      }
      perf++;
    }

    const clientIds = [...new Set(due.map((d) => Number(d.client_id)))];
    for (const [i, clientId] of clientIds.entries()) {
      if (mode === 'current' && i > 0) continue;
      const status = mode === 'current' ? 'draft' : mode === 'mixed' && i % 2 === 1 ? 'submitted' : 'approved';
      await insert(
        `insert into account_reviews (client_id, period, status, rating, summary, risks, opportunities, actions,
                                      submitted_at, submitted_by_user_id, approved_at, approved_by_user_id, created_by_user_id, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clientId,
          period,
          status,
          RATINGS[(i + pi) % RATINGS.length],
          ACCOUNT_SUMMARIES[(i + pi) % ACCOUNT_SUMMARIES.length],
          'One deployment ends next quarter; renewal not yet discussed.',
          'Client mentioned a data team build-out in the new year.',
          'Account manager to set up a quarterly review with the client.',
          status === 'draft' ? null : at,
          status === 'draft' ? null : rm,
          status === 'approved' ? at : null,
          status === 'approved' ? admin : null,
          rm,
          at,
        ],
      );
      acct++;
    }
  }
  console.log(`Added ${perf} performance review(s) and ${acct} account review(s) across ${plan.length} months.`);
}

async function seedSkills() {
  if ((await count('resource_skills')) > 0) {
    console.log('Skill levels already exist — no levels added.');
    return;
  }
  const catalogue = new Map(
    (await client.execute('select id, name from skills where active = 1')).rows.map((r) => [skillKey(String(r.name)), Number(r.id)]),
  );
  if (catalogue.size === 0) {
    console.log('The skills list is empty. Run `npm run db:migrate` first.');
    return;
  }
  const rm = await firstUser('resource_manager');
  const now = new Date().toISOString();
  const { rows: people } = await client.execute('select id, primary_skill, secondary_skill, other_skills from resources order by id');
  let added = 0;
  for (const [i, p] of people.entries()) {
    const wanted = new Map<number, number>();
    const add = (name: unknown, level: number) => {
      const id = typeof name === 'string' ? catalogue.get(skillKey(name)) : undefined;
      if (id !== undefined && !wanted.has(id)) wanted.set(id, level);
    };
    add(p.primary_skill, i % 3 === 0 ? 5 : 4);
    add(p.secondary_skill, 3);
    try {
      const others: unknown = JSON.parse(String(p.other_skills ?? '[]'));
      if (Array.isArray(others)) others.forEach((o, j) => add(o, j % 2 === 0 ? 3 : 2));
    } catch {
      // Unparseable other skills are skipped.
    }
    for (const [skillId, level] of wanted) {
      await insert(
        'insert into resource_skills (resource_id, skill_id, level, assessed_by_user_id, assessed_at) values (?, ?, ?, ?, ?)',
        [p.id, skillId, level, rm, now],
      );
      added++;
    }
  }
  console.log(`Added ${added} skill level(s) across ${people.length} resource(s).`);
}

async function main() {
  const { rows: tables } = await client.execute(
    "select name from sqlite_master where type='table' and name in ('skills', 'resource_skills', 'review_criteria', 'performance_reviews', 'performance_review_scores', 'account_reviews')",
  );
  if (tables.length < 6) {
    console.error('The review tables do not exist yet. Run `npm run db:migrate` first.');
    process.exit(1);
  }
  await seedReviews();
  await seedSkills();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());
