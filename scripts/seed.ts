/**
 * Seeds a realistic staffing dataset: bench resources, clients, projects,
 * a mix of billable/shadow/split deployments, a renewed agreement chain,
 * invoices across all four collection stages, plus the opportunity pipeline
 * and candidate pool.
 *
 * Safe to re-run: it clears the tables first.
 *   npm run db:seed
 *
 * Targets TURSO_DATABASE_URL when set, otherwise the local libSQL file.
 */
import { createClient } from '@libsql/client';
import crypto from 'node:crypto';
import { DDL } from '../lib/ddl';

// `|| ''` before `.trim()` treats an env var that's set-but-blank the same
// as unset — `??` alone doesn't, and libSQL rejects '' with an opaque error.
const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url, authToken });

/** Holds a SQL string; kept so call sites read like prepared statements. */
const q = (sql: string) => sql;

/**
 * Executes and returns the new rowid. Accepts loose or spread args.
 * libSQL rejects `undefined` outright (better-sqlite3 coerced it), so missing
 * trailing values are normalised to NULL here.
 */
async function run(sql: string, ...args: unknown[]): Promise<number> {
  const flat = args.flat().map((v) => (v === undefined ? null : v));
  const r = await client.execute({ sql, args: flat as never });
  return Number(r.lastInsertRowid ?? 0);
}

async function main() {
await client.executeMultiple(DDL);

// Clear in FK-safe order.
for (const t of [
  'opportunity_stage_history',
  'opportunity_comments',
  'opportunity_candidates',
  'opportunities',
  'candidates',
  'invoice_resources',
  'invoices',
  'agreement_resources',
  'agreements',
  'deployments',
  'projects',
  'clients',
  'resources',
]) {
  await run(`DELETE FROM ${t}`);
  await run(`DELETE FROM sqlite_sequence WHERE name = ?`, t);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => iso(new Date(Date.now() + n * 86_400_000));

/* ── Resources ─────────────────────────────────────────────── */

const resourceRows = [
  ['Ananya Iyer', 'ananya.iyer@techstalwarts.com', '+91 98200 41192', 'Senior Data Engineer', 2_150_000, 2_400_000, daysFromNow(24), 'Apache Spark', 'Airflow', '["Scala","dbt","Snowflake"]'],
  ['Rohit Deshmukh', 'rohit.deshmukh@techstalwarts.com', '+91 99303 55210', 'Lead Java Developer', 2_650_000, null, null, 'Java / Spring Boot', 'Kafka', '["PostgreSQL","Kubernetes"]'],
  ['Meera Krishnan', 'meera.krishnan@techstalwarts.com', '+91 91760 88431', 'SAP FICO Consultant', 1_980_000, null, null, 'SAP FICO', 'SAP MM', '["S/4HANA"]'],
  ['Farhan Qureshi', 'farhan.qureshi@techstalwarts.com', '+91 98110 30984', 'DevOps Engineer', 1_740_000, 1_920_000, daysFromNow(-40), 'Kubernetes', 'Terraform', '["AWS","ArgoCD","Prometheus"]'],
  ['Sneha Patil', 'sneha.patil@techstalwarts.com', '+91 90040 71265', 'Frontend Engineer', 1_450_000, null, null, 'React', 'TypeScript', '["Next.js","Tailwind"]'],
  ['Vikram Rao', 'vikram.rao@techstalwarts.com', '+91 89760 12408', 'QA Automation Lead', 1_620_000, null, null, 'Selenium', 'Playwright', '["JMeter","REST Assured"]'],
  ['Divya Menon', 'divya.menon@techstalwarts.com', '+91 97400 66319', 'Business Analyst', 1_320_000, null, null, 'Business Analysis', 'SQL', '["Tableau","JIRA"]'],
  ['Arjun Sethi', 'arjun.sethi@techstalwarts.com', '+91 98730 44827', 'Junior Java Developer', 780_000, null, null, 'Java / Spring Boot', null, '["JUnit"]'],
  ['Kavya Nair', 'kavya.nair@techstalwarts.com', '+91 94470 20516', 'Cloud Architect', 3_100_000, null, null, 'AWS', 'Azure', '["Terraform","Well-Architected"]'],
  ['Imran Shaikh', 'imran.shaikh@techstalwarts.com', '+91 98920 77034', 'Data Analyst', 1_050_000, null, null, 'SQL', 'Power BI', '["Python","Excel"]'],
];

const insertResource = q(`
  INSERT INTO resources (name, email, mobile, designation, current_ctc, revised_ctc,
    revised_effective_from, primary_skill, secondary_skill, other_skills)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const r of resourceRows) await run(insertResource, ...r);

/* ── Clients ───────────────────────────────────────────────── */

const clientRows = [
  ['Northwind Financial Services', 'Priya Raghavan', 'priya.raghavan@northwindfs.com', '+91 98450 11002', 'VP Engineering', 'Sandeep Bhatt', 'sandeep.bhatt@northwindfs.com', '+91 98450 11045', 'Anil Kapoor', 'anil.kapoor@northwindfs.com', '+91 98450 11078', 'Delivery Head'],
  ['Kestrel Retail Group', 'Nikhil Chawla', 'nikhil.chawla@kestrelretail.in', '+91 99870 22910', 'Head of Digital', 'Ruchi Malhotra', 'ruchi.malhotra@kestrelretail.in', '+91 99870 22933', null, null, null, null],
  ['Aurelia Health Systems', 'Dr. Shalini Verma', 'shalini.verma@aureliahealth.com', '+91 89290 33471', 'CTO', 'Manav Gupta', 'manav.gupta@aureliahealth.com', '+91 89290 33488', 'Rakesh Pillai', 'rakesh.pillai@aureliahealth.com', '+91 89290 33512', 'Program Manager'],
  ['Solaris Manufacturing Ltd', 'Ganesh Subramanian', 'ganesh.s@solarismfg.co.in', '+91 94220 55018', 'IT Director', 'Neha Joshi', 'neha.joshi@solarismfg.co.in', '+91 94220 55062', null, null, null, null],
];

const insertClient = q(`
  INSERT INTO clients (company_name, spoc_name, spoc_email, spoc_mobile, spoc_designation,
    account_name, account_email, account_mobile,
    alt_spoc_name, alt_spoc_email, alt_spoc_mobile, alt_spoc_designation)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const c of clientRows) await run(insertClient, ...c);

/* ── Projects ──────────────────────────────────────────────── */

const projectRows = [
  [1, 'Core Banking Data Platform', 'Priya Raghavan', 'priya.raghavan@northwindfs.com', '+91 98450 11002', 'VP Engineering'],
  [1, 'Regulatory Reporting Revamp', 'Anil Kapoor', 'anil.kapoor@northwindfs.com', '+91 98450 11078', 'Delivery Head'],
  [2, 'Omnichannel Commerce Rebuild', 'Nikhil Chawla', 'nikhil.chawla@kestrelretail.in', '+91 99870 22910', 'Head of Digital'],
  [3, 'Patient Records Migration', 'Rakesh Pillai', 'rakesh.pillai@aureliahealth.com', '+91 89290 33512', 'Program Manager'],
  [4, 'SAP S/4HANA Rollout', 'Ganesh Subramanian', 'ganesh.s@solarismfg.co.in', '+91 94220 55018', 'IT Director'],
];

const insertProject = q(`
  INSERT INTO projects (client_id, project_name, manager_name, manager_email, manager_mobile, manager_designation)
  VALUES (?, ?, ?, ?, ?, ?)`);
for (const p of projectRows) await run(insertProject, ...p);

/* ── Deployments ───────────────────────────────────────────── */
// Exercises every allocation shape: full billable, 60/40 split across two
// clients, billable + shadow mix, shadow-only, and an ended record.

const deploymentRows = [
  // resource, project, type, alloc%, start, end, billing, commission, gst, status
  [1, 1, 'billable', 100, daysFromNow(-180), null, 285_000, 42_000, 1, 'active'],
  [2, 1, 'billable', 60, daysFromNow(-150), null, 198_000, 28_000, 1, 'active'],
  [2, 3, 'billable', 40, daysFromNow(-95), null, 132_000, 19_000, 1, 'active'],
  [3, 5, 'billable', 100, daysFromNow(-210), daysFromNow(18), 245_000, 35_000, 1, 'active'],
  [4, 3, 'billable', 80, daysFromNow(-120), null, 232_000, 33_000, 1, 'active'],
  [4, 4, 'shadow', 20, daysFromNow(-45), null, 0, 0, 0, 'active'],
  [5, 3, 'billable', 100, daysFromNow(-75), daysFromNow(9), 168_000, 24_000, 1, 'active'],
  [6, 4, 'billable', 100, daysFromNow(-160), null, 186_000, 26_000, 1, 'active'],
  [7, 2, 'billable', 50, daysFromNow(-88), null, 96_000, 14_000, 1, 'active'],
  [8, 1, 'shadow', 100, daysFromNow(-30), null, 0, 0, 0, 'active'],
  [9, 4, 'billable', 100, daysFromNow(-240), null, 340_000, 48_000, 1, 'active'],
  [10, 2, 'billable', 100, daysFromNow(-300), daysFromNow(-20), 124_000, 18_000, 1, 'ended'],
];

const insertDeployment = q(`
  INSERT INTO deployments (resource_id, project_id, deployment_type, allocation_percentage,
    start_date, end_date, billing_amount, commission_amount, gst_applicable, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const d of deploymentRows) await run(insertDeployment, ...d);

/* ── Agreements: one renewed chain (v1 -> v2) plus standalone POs ── */

const insertAgreement = q(`
  INSERT INTO agreements (project_id, parent_agreement_id, agreement_number, title, scope,
    value, start_date, end_date, renewal_version, status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertAgrRes = q(`
  INSERT INTO agreement_resources (agreement_id, resource_id, billing_amount) VALUES (?, ?, ?)`);

// v1 — team PO for Northwind, superseded by v2.
const v1 = await run(insertAgreement, 
  1, null, 'NW/PO/2024-0118', 'Data Platform Squad — Annual', 'team',
  5_040_000, daysFromNow(-395), daysFromNow(-30), 1, 'renewed',
  'Initial 12-month engagement for the core data platform build.',
);
await run(insertAgrRes, v1, 1, 260_000);
await run(insertAgrRes, v1, 2, 160_000);

// v2 — renewal: rate uplift and Arjun added to the squad.
const v2 = await run(insertAgreement, 
  1, v1, 'NW/PO/2025-0207', 'Data Platform Squad — Annual', 'team',
  6_396_000, daysFromNow(-29), daysFromNow(336), 2, 'active',
  'Renewed with revised rates. Arjun Sethi added as shadow resource for knowledge transfer.',
);
await run(insertAgrRes, v2, 1, 285_000);
await run(insertAgrRes, v2, 2, 198_000);
await run(insertAgrRes, v2, 8, 0);

// Standalone individual PO, expiring inside the 30-day alert window.
const a3 = await run(insertAgreement, 
  5, null, 'SOL/PO/2024-0455', 'SAP FICO Consultant — S/4HANA Rollout', 'individual',
  2_940_000, daysFromNow(-210), daysFromNow(18), 1, 'active',
  'Fixed-term consultant engagement through go-live.',
);
await run(insertAgrRes, a3, 3, 245_000);

// Team PO for Kestrel.
const a4 = await run(insertAgreement, 
  3, null, 'KRG/PO/2025-0092', 'Commerce Rebuild Pod', 'team',
  6_384_000, daysFromNow(-120), daysFromNow(245), 1, 'active',
  'Three-resource pod covering backend, DevOps and frontend.',
);
await run(insertAgrRes, a4, 2, 132_000);
await run(insertAgrRes, a4, 4, 232_000);
await run(insertAgrRes, a4, 5, 168_000);

// Aurelia PO.
const a5 = await run(insertAgreement, 
  4, null, 'AHS/PO/2024-0311', 'Records Migration — Cloud & QA', 'team',
  6_312_000, daysFromNow(-240), daysFromNow(120), 1, 'active',
  'Cloud architecture and QA automation for the migration programme.',
);
await run(insertAgrRes, a5, 9, 340_000);
await run(insertAgrRes, a5, 6, 186_000);

/* ── Invoices: spread across all four statuses ─────────────── */

const insertInvoice = q(`
  INSERT INTO invoices (project_id, agreement_id, invoice_number, scope, period_from, period_to,
    amount, gst_amount, invoice_date, due_date, collected_date, status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertInvRes = q(`
  INSERT INTO invoice_resources (invoice_id, resource_id) VALUES (?, ?)`);

const invoiceRows: [number, number | null, string, string, string, string, number, number, string | null, string | null, string | null, string, string | null, number[]][] = [
  [1, v2, 'TS/INV/2025-0341', 'team', daysFromNow(-29), daysFromNow(1), 483_000, 86_940, daysFromNow(-27), daysFromNow(3), null, 'pending_collection', 'Monthly billing for the data platform squad.', [1, 2]],
  [1, v1, 'TS/INV/2025-0298', 'team', daysFromNow(-60), daysFromNow(-30), 420_000, 75_600, daysFromNow(-58), daysFromNow(-28), daysFromNow(-31), 'collected', null, [1, 2]],
  [1, v1, 'TS/INV/2025-0255', 'team', daysFromNow(-91), daysFromNow(-61), 420_000, 75_600, daysFromNow(-89), daysFromNow(-59), daysFromNow(-55), 'collected', null, [1, 2]],
  [5, a3, 'TS/INV/2025-0344', 'individual', daysFromNow(-29), daysFromNow(1), 245_000, 44_100, daysFromNow(-26), daysFromNow(-4), null, 'raised', 'Overdue — followed up with Solaris AP team on 3rd.', [3]],
  [3, a4, 'TS/INV/2025-0347', 'team', daysFromNow(-29), daysFromNow(1), 532_000, 95_760, daysFromNow(-25), daysFromNow(5), null, 'pending_collection', null, [2, 4, 5]],
  [3, a4, 'TS/INV/2025-0301', 'team', daysFromNow(-60), daysFromNow(-30), 532_000, 95_760, daysFromNow(-57), daysFromNow(-27), daysFromNow(-24), 'collected', null, [2, 4, 5]],
  [4, a5, 'TS/INV/2025-0349', 'team', daysFromNow(-29), daysFromNow(1), 526_000, 94_680, null, daysFromNow(8), null, 'not_raised', 'Awaiting signed timesheets from Aurelia PMO.', [9, 6]],
  [4, a5, 'TS/INV/2025-0305', 'team', daysFromNow(-60), daysFromNow(-30), 526_000, 94_680, daysFromNow(-56), daysFromNow(-26), daysFromNow(-19), 'collected', null, [9, 6]],
  [2, null, 'TS/INV/2025-0352', 'individual', daysFromNow(-29), daysFromNow(1), 96_000, 17_280, null, daysFromNow(12), null, 'not_raised', 'BA engagement, no formal PO in place yet.', [7]],
];

for (const [pid, aid, num, scope, pf, pt, amt, gst, idate, ddate, cdate, status, notes, rids] of invoiceRows) {
  const id = await run(
    insertInvoice, pid, aid, num, scope, pf, pt, amt, gst, idate, ddate, cdate, status, notes,
  );
  for (const rid of rids) await run(insertInvRes, id, rid);
}

/* ── Candidates: in-house bench + partner/agency sourced ───── */

const insertCandidate = q(`
  INSERT INTO candidates (resource_id, name, email, mobile, current_designation, experience_years,
    primary_skill, secondary_skill, other_skills, current_ctc, expected_ctc,
    notice_period_days, location, source, source_name, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const candidateRows: [number | null, string, string, string, string, number, string, string | null, string, number | null, number | null, number | null, string, string, string | null, string | null][] = [
  // In-house — Imran and Divya are on the bench with spare capacity.
  [10, 'Imran Shaikh', 'imran.shaikh@techstalwarts.com', '+91 98920 77034', 'Data Analyst', 4, 'SQL', 'Power BI', '["Python","Excel"]', 1_050_000, 1_250_000, 0, 'Mumbai', 'in_house', null, 'On bench since the Northwind rollout closed.'],
  [7, 'Divya Menon', 'divya.menon@techstalwarts.com', '+91 97400 66319', 'Business Analyst', 6, 'Business Analysis', 'SQL', '["Tableau","JIRA"]', 1_320_000, 1_500_000, 0, 'Bengaluru', 'in_house', null, 'Currently 50% allocated; available for a part-time second engagement.'],

  // Partner-sourced.
  [null, 'Nandini Bhatt', 'nandini.bhatt@example.com', '+91 98211 40567', 'Senior .NET Developer', 6, 'C# / .NET', 'Angular', '["MVC","SQL Server","Azure"]', 1_850_000, 2_300_000, 30, 'Pune', 'partner', 'Sattva Tech Partners', 'Strong Angular + MVC blend, matches the CTDI brief.'],
  [null, 'Rahul Venkatesh', 'rahul.v@example.com', '+91 90080 22314', 'Full Stack Engineer', 5, 'Angular', 'C# / .NET', '["MVC","Web API"]', 1_600_000, 2_000_000, 60, 'Chennai', 'partner', 'Sattva Tech Partners', 'Open to USA-timezone shift.'],
  [null, 'Aisha Rahman', 'aisha.rahman@example.com', '+91 99456 71180', 'Java Developer', 4, 'Java / Spring Boot', 'Angular', '["Hibernate","REST"]', 1_180_000, 1_450_000, 30, 'Mumbai', 'partner', 'Cornerstone Staffing', 'Onsite-ready for the Transbnk C2H roles.'],

  // Agency-sourced.
  [null, 'Karthik Subramaniam', 'karthik.s@example.com', '+91 87540 39902', 'Senior Java Engineer', 7, 'Java / Spring Boot', 'Kafka', '["Microservices","Kubernetes"]', 2_400_000, 2_900_000, 90, 'Mumbai', 'agency', 'Zenith Recruitment', 'Fits the Transbnk senior Java requirement.'],
  [null, 'Priyanka Deshpande', 'priyanka.d@example.com', '+91 98330 55471', 'QA Automation Engineer', 4, 'Selenium', 'Playwright', '["TestNG","CI/CD"]', 1_150_000, 1_400_000, 30, 'Mumbai', 'agency', 'Zenith Recruitment', 'Goregaon-based, hybrid suits her.'],
  [null, 'Sameer Kulkarni', 'sameer.k@example.com', '+91 96190 88240', 'AI/ML Engineer', 6, 'Machine Learning', 'Python', '["LLMs","PyTorch","MLOps"]', 2_800_000, 3_600_000, 60, 'Mumbai', 'agency', 'DeepHire Consulting', 'Shortlisted for the BFSI AI pilot.'],
  [null, 'Farida Contractor', 'farida.c@example.com', '+91 98195 62038', 'Cyber Security Engineer', 8, 'Cyber Security', 'SIEM', '["Threat Modelling","ISO 27001"]', 2_950_000, 3_500_000, 90, 'Mumbai', 'agency', 'DeepHire Consulting', 'BFSI background, Bandra reachable.'],
  [null, 'Gaurav Malhotra', 'gaurav.m@example.com', '+91 99870 41125', 'Angular Developer', 4, 'Angular', 'TypeScript', '["RxJS","NgRx"]', 1_250_000, 1_600_000, 15, 'Mumbai', 'agency', 'Cornerstone Staffing', null],
];

for (const c of candidateRows) await run(insertCandidate, ...c);

/* ── Opportunities (sample data) ───────────────────────────── */
// Clients 1-4 exist; CTDI, Transbnk, IPru, IndusInd and the BFSI account are
// prospects (client_id null) since they are not onboarded yet.

const insertOpportunity = q(`
  INSERT INTO opportunities (client_id, company_name, title, experience_min, experience_max,
    primary_skill, secondary_skill, other_skills, work_mode, location, timezone, engagement_type,
    required_count, budget_min, budget_max, jd_content, working_days, working_hours,
    stage, priority, owner, next_step, next_step_date, closed_reason, share_token)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const insertStage = q(`
  INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, note, created_at)
  VALUES (?, ?, ?, ?, ?)`);

const token = () => crypto.randomBytes(16).toString('hex');

type OppSeed = {
  clientId: number | null;
  company: string;
  title: string;
  expMin: number | null;
  expMax: number | null;
  primary: string;
  secondary: string | null;
  other: string;
  mode: string | null;
  location: string | null;
  tz: string | null;
  engagement: string | null;
  count: number;
  budgetMin: number | null;
  budgetMax: number | null;
  jd: string;
  days: string | null;
  hours: string | null;
  stage: string;
  priority: string;
  owner: string;
  nextStep: string | null;
  nextStepDays: number | null;
  reason: string | null;
  /** Stages walked through, to build a believable history trail. */
  trail: string[];
};

const opps: OppSeed[] = [
  {
    clientId: null, company: 'CTDI',
    title: 'FullStack Engineer (Angular + MVC + C#)',
    expMin: 5, expMax: 7, primary: 'C# / .NET', secondary: 'Angular',
    other: '["MVC","Web API","SQL Server"]',
    mode: 'remote', location: null, tz: 'USA Timezone', engagement: 'contract',
    count: 1, budgetMin: 180_000, budgetMax: 220_000,
    jd: 'Full stack engineer working across an Angular front end and a C# / ASP.NET MVC back end. Overlap with US business hours is required for daily stand-ups and pairing with the onshore team. Experience with Web API, Entity Framework and SQL Server expected.',
    days: 'Mon–Fri', hours: '2:00 PM – 11:00 PM IST',
    stage: 'candidate_mapping', priority: 'high', owner: 'Amir Shaikh',
    nextStep: 'Share Nandini and Rahul profiles with CTDI panel', nextStepDays: -1,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting', 'candidate_mapping'],
  },
  {
    clientId: null, company: 'CTDI',
    title: 'FullStack Engineer (Angular + MVC + C#)',
    expMin: 5, expMax: 7, primary: 'C# / .NET', secondary: 'Angular',
    other: '["MVC","Web API","SQL Server"]',
    mode: 'remote', location: null, tz: 'India Timezone', engagement: 'contract',
    count: 2, budgetMin: 150_000, budgetMax: 185_000,
    jd: 'Same stack as the USA-timezone requirement but operating on IST business hours, supporting the India-based delivery pod. Two positions open.',
    days: 'Mon–Fri', hours: '10:00 AM – 7:00 PM IST',
    stage: 'qualification', priority: 'high', owner: 'Amir Shaikh',
    nextStep: 'Confirm whether both roles carry the same rate card', nextStepDays: 2,
    reason: null,
    trail: ['requirement', 'qualification'],
  },
  {
    clientId: null, company: 'Transbnk',
    title: 'Angular Developer',
    expMin: 3, expMax: 5, primary: 'Angular', secondary: 'TypeScript',
    other: '["RxJS","NgRx"]',
    mode: 'onsite', location: 'Mumbai', tz: 'India Timezone', engagement: 'c2h',
    count: 1, budgetMin: 110_000, budgetMax: 140_000,
    jd: 'Angular developer for a contract-to-hire engagement. Onsite from the Transbnk Mumbai office five days a week. Conversion to permanent payroll expected after six months subject to performance.',
    days: 'Mon–Fri', hours: '9:30 AM – 6:30 PM IST',
    stage: 'interview', priority: 'high', owner: 'Amir Shaikh',
    nextStep: 'Gaurav round 2 scheduled — collect panel feedback', nextStepDays: 1,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting', 'candidate_mapping', 'interview'],
  },
  {
    clientId: null, company: 'Transbnk',
    title: 'Java Developer — Junior',
    expMin: 3, expMax: 5, primary: 'Java / Spring Boot', secondary: 'SQL',
    other: '["Hibernate","REST"]',
    mode: 'onsite', location: 'Mumbai', tz: 'India Timezone', engagement: 'c2h',
    count: 2, budgetMin: 95_000, budgetMax: 125_000,
    jd: 'Junior Java engineers for the core banking integration squad. Spring Boot, REST APIs and relational data modelling. Contract-to-hire, onsite Mumbai.',
    days: 'Mon–Fri', hours: '9:30 AM – 6:30 PM IST',
    stage: 'candidate_mapping', priority: 'medium', owner: 'Amir Shaikh',
    nextStep: 'Source two more junior Java profiles', nextStepDays: 3,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting', 'candidate_mapping'],
  },
  {
    clientId: null, company: 'Transbnk',
    title: 'Java Developer — Senior',
    expMin: 6, expMax: 8, primary: 'Java / Spring Boot', secondary: 'Kafka',
    other: '["Microservices","Kubernetes"]',
    mode: 'onsite', location: 'Mumbai', tz: 'India Timezone', engagement: 'c2h',
    count: 1, budgetMin: 180_000, budgetMax: 225_000,
    jd: 'Senior Java engineer to lead the integration squad. Microservices architecture, Kafka event streaming, and mentoring two junior engineers. Onsite Mumbai, contract-to-hire.',
    days: 'Mon–Fri', hours: '9:30 AM – 6:30 PM IST',
    stage: 'interview', priority: 'high', owner: 'Amir Shaikh',
    nextStep: 'Karthik client round on Thursday', nextStepDays: 4,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting', 'candidate_mapping', 'interview'],
  },
  {
    clientId: null, company: 'Transbnk',
    title: 'FullStack Engineer (Angular + Java)',
    expMin: 3, expMax: 5, primary: 'Java / Spring Boot', secondary: 'Angular',
    other: '["REST","TypeScript"]',
    mode: 'onsite', location: 'Mumbai', tz: 'India Timezone', engagement: 'c2h',
    count: 1, budgetMin: 120_000, budgetMax: 150_000,
    jd: 'Full stack engineer spanning an Angular front end and Spring Boot services. Onsite Mumbai, contract-to-hire.',
    days: 'Mon–Fri', hours: '9:30 AM – 6:30 PM IST',
    stage: 'budgeting', priority: 'medium', owner: 'Amir Shaikh',
    nextStep: 'Awaiting rate confirmation from Transbnk procurement', nextStepDays: 5,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting'],
  },
  {
    clientId: null, company: 'ICICI Prudential',
    title: 'QA Automation Engineer',
    expMin: 3, expMax: 4, primary: 'Selenium', secondary: 'Playwright',
    other: '["TestNG","CI/CD","REST Assured"]',
    mode: 'hybrid', location: 'Goregaon, Mumbai', tz: 'India Timezone', engagement: 'contract',
    count: 1, budgetMin: 100_000, budgetMax: 130_000,
    jd: 'QA automation engineer for the policy administration platform. Selenium and Playwright suites, API test coverage, and CI integration. Hybrid — three days a week from the Goregaon office.',
    days: 'Mon–Fri (3 days onsite)', hours: '9:00 AM – 6:00 PM IST',
    stage: 'candidate_mapping', priority: 'medium', owner: 'Amir Shaikh',
    nextStep: 'Submit Priyanka profile to IPru hiring manager', nextStepDays: 0,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting', 'candidate_mapping'],
  },
  {
    clientId: null, company: 'ICICI Prudential',
    title: 'Java Developer — Senior',
    expMin: 4, expMax: 6, primary: 'Java / Spring Boot', secondary: 'SQL',
    other: '["Microservices","Oracle"]',
    mode: 'hybrid', location: 'Goregaon, Mumbai', tz: 'India Timezone', engagement: 'contract',
    count: 1, budgetMin: 150_000, budgetMax: 190_000,
    jd: 'Senior Java engineer for the policy administration platform. Spring Boot microservices against an Oracle backend. Hybrid — three days a week onsite at Goregaon.',
    days: 'Mon–Fri (3 days onsite)', hours: '9:00 AM – 6:00 PM IST',
    stage: 'qualification', priority: 'medium', owner: 'Amir Shaikh',
    nextStep: 'Clarify Oracle vs PostgreSQL expectation with the panel', nextStepDays: 6,
    reason: null,
    trail: ['requirement', 'qualification'],
  },
  {
    clientId: null, company: 'IndusInd Bank',
    title: 'FullStack Engineer (Angular + .NET Core Microservices)',
    expMin: 5, expMax: 6, primary: 'C# / .NET', secondary: 'Angular',
    other: '["Microservices",".NET Core","Azure"]',
    mode: 'onsite', location: 'Andheri, Mumbai', tz: 'India Timezone', engagement: 'contract',
    count: 3,
    budgetMin: 160_000, budgetMax: 200_000,
    jd: 'Full stack engineers for the digital banking platform. Angular front end against .NET Core microservices. Onsite five days a week at Andheri. Two to three positions depending on final headcount approval.',
    days: 'Mon–Fri', hours: '9:30 AM – 6:30 PM IST',
    stage: 'budgeting', priority: 'high', owner: 'Amir Shaikh',
    nextStep: 'Confirm final headcount — 2 or 3 — before rate submission', nextStepDays: 2,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting'],
  },
  {
    clientId: null, company: 'BFSI Client (Confidential)',
    title: 'AI Engineer',
    expMin: 5, expMax: null, primary: 'Machine Learning', secondary: 'Python',
    other: '["LLMs","MLOps","PyTorch"]',
    mode: 'onsite', location: 'Bandra, Mumbai', tz: 'India Timezone', engagement: 'pilot',
    count: 1, budgetMin: 250_000, budgetMax: 320_000,
    jd: 'AI engineer for a BFSI innovation team. Engagement opens with a three-week paid pilot run; conversion to a longer contract is subject to pilot outcome. Onsite at Bandra.',
    days: 'Mon–Fri', hours: '10:00 AM – 7:00 PM IST',
    stage: 'interview', priority: 'high', owner: 'Amir Shaikh',
    nextStep: 'Sameer pilot scoping call with the client AI lead', nextStepDays: 1,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting', 'candidate_mapping', 'interview'],
  },
  {
    clientId: null, company: 'BFSI Client (Confidential)',
    title: 'Cyber Security Engineer',
    expMin: 5, expMax: null, primary: 'Cyber Security', secondary: 'SIEM',
    other: '["Threat Modelling","ISO 27001","SOC"]',
    mode: 'onsite', location: 'Bandra, Mumbai', tz: 'India Timezone', engagement: 'pilot',
    count: 1, budgetMin: 240_000, budgetMax: 300_000,
    jd: 'Cyber security engineer for a BFSI security function. Three-week paid pilot run before a longer engagement is confirmed. Threat modelling, SIEM tuning and control review. Onsite at Bandra.',
    days: 'Mon–Fri', hours: '10:00 AM – 7:00 PM IST',
    stage: 'candidate_mapping', priority: 'medium', owner: 'Amir Shaikh',
    nextStep: 'Confirm Farida availability against the pilot start date', nextStepDays: 7,
    reason: null,
    trail: ['requirement', 'qualification', 'budgeting', 'candidate_mapping'],
  },
];

const oppIds: number[] = [];
for (const o of opps) {
  const id = await run(
    insertOpportunity,
    o.clientId, o.company, o.title, o.expMin, o.expMax, o.primary, o.secondary, o.other,
    o.mode, o.location, o.tz, o.engagement, o.count, o.budgetMin, o.budgetMax,
    o.jd, o.days, o.hours, o.stage, o.priority, o.owner,
    o.nextStep, o.nextStepDays === null ? null : daysFromNow(o.nextStepDays),
    o.reason, token(),
  );
  oppIds.push(id);

  // Walk the trail so stage history reads like a real progression.
  let prev: string | null = null;
  for (const [step, stage] of o.trail.entries()) {
    const daysAgo = (o.trail.length - step) * 6 + 2;
    await run(
      insertStage,
      id, prev, stage,
      step === 0 ? 'Opportunity created' : null,
      daysFromNow(-daysAgo) + ' 10:00:00',
    );
    prev = stage;
  }
}

/* ── Candidate mappings ────────────────────────────────────── */

const insertOppCand = q(`
  INSERT INTO opportunity_candidates (opportunity_id, candidate_id, status, interview_round,
    interview_date, feedback, expected_billing)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);

// [opportunity index, candidate id, status, round, interviewDaysFromNow, feedback, billing]
const mappings: [number, number, string, number, number | null, string | null, number | null][] = [
  [0, 3, 'submitted', 0, null, 'Profile shared with CTDI panel, awaiting shortlist.', 205_000],
  [0, 4, 'screening', 0, null, 'Internal screening cleared; checking USA-shift comfort.', 195_000],
  [2, 10, 'interview', 2, 1, 'Round 1 cleared with the tech panel. Round 2 with the delivery head.', 128_000],
  [3, 5, 'submitted', 0, null, 'Shared for the junior Java position.', 115_000],
  [4, 6, 'interview', 1, 4, 'Strong on microservices. Client round pending.', 215_000],
  [6, 7, 'mapped', 0, null, null, 122_000],
  [9, 8, 'interview', 1, 1, 'Technical screen cleared. Pilot scoping call next.', 300_000],
  [10, 9, 'mapped', 0, null, 'Awaiting availability confirmation.', 285_000],
];

for (const [oppIdx, candId, status, round, ivDays, feedback, billing] of mappings) {
  await run(insertOppCand, 
    oppIds[oppIdx], candId, status, round,
    ivDays === null ? null : daysFromNow(ivDays),
    feedback, billing,
  );
}

/* ── Comments ──────────────────────────────────────────────── */

const insertComment = q(`
  INSERT INTO opportunity_comments (opportunity_id, author, author_role, body, is_followup, follow_up_date, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);

const comments: [number, string, string, string, number, number | null, number][] = [
  [0, 'Amir Shaikh', 'internal', 'CTDI confirmed the USA-timezone role is the priority of the two. Rate card accepted at the upper band.', 0, null, -8],
  [0, 'Ravi Menon', 'stakeholder', 'I have a strong Angular + MVC profile from my network with 6 years, currently serving notice. Shall I share the CV?', 0, null, -4],
  [0, 'Amir Shaikh', 'internal', 'Share Nandini and Rahul profiles with CTDI panel', 1, -1, -3],
  [2, 'Amir Shaikh', 'internal', 'Gaurav cleared round 1 comfortably. Panel wants a second round focused on NgRx state management.', 0, null, -5],
  [2, 'Amir Shaikh', 'internal', 'Gaurav round 2 scheduled — collect panel feedback', 1, 1, -2],
  [4, 'Amir Shaikh', 'internal', 'Karthik is a strong fit but has a 90-day notice. Flagged to Transbnk; they are willing to wait for the right senior profile.', 0, null, -6],
  [8, 'Amir Shaikh', 'internal', 'IndusInd still deciding between 2 and 3 positions. Holding rate submission until headcount is final so we quote once.', 0, null, -3],
  [9, 'Sameer Kulkarni', 'stakeholder', 'Happy to take the pilot. One question — is the three-week pilot paid at the same rate as the main engagement?', 0, null, -2],
  [9, 'Amir Shaikh', 'internal', 'Sameer pilot scoping call with the client AI lead', 1, 1, -1],
];

for (const [oppIdx, author, role, body, isF, fDays, createdDays] of comments) {
  await run(insertComment, 
    oppIds[oppIdx], author, role, body, isF,
    fDays === null ? null : daysFromNow(fDays),
    daysFromNow(createdDays) + ' 11:30:00',
  );
}

const count = async (t: string) =>
  Number((await client.execute(`SELECT count(*) c FROM ${t}`)).rows[0].c);

console.log('Seeded:');
for (const t of [
  'resources', 'clients', 'projects', 'deployments', 'agreements', 'invoices',
  'candidates', 'opportunities', 'opportunity_candidates', 'opportunity_comments',
  'opportunity_stage_history',
]) {
  console.log(`  ${t.padEnd(26)} ${await count(t)}`);
}
client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
