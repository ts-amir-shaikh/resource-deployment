/**
 * Schema DDL, applied idempotently by `npm run db:migrate` and the seed script.
 * Kept as raw SQL so it runs against both a local libSQL file and Turso.
 */
export const DDL = `
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT,
  designation TEXT,
  current_ctc REAL,
  revised_ctc REAL,
  revised_effective_from TEXT,
  primary_skill TEXT,
  secondary_skill TEXT,
  other_skills TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS res_primary_skill_idx ON resources(primary_skill);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  spoc_name TEXT, spoc_email TEXT, spoc_mobile TEXT, spoc_designation TEXT,
  account_name TEXT, account_email TEXT, account_mobile TEXT,
  alt_spoc_name TEXT, alt_spoc_email TEXT, alt_spoc_mobile TEXT, alt_spoc_designation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  project_name TEXT NOT NULL,
  manager_name TEXT, manager_email TEXT, manager_mobile TEXT, manager_designation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS proj_client_idx ON projects(client_id);

CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  agreement_id INTEGER REFERENCES agreements(id),
  deployment_type TEXT NOT NULL DEFAULT 'billable',
  allocation_percentage INTEGER NOT NULL DEFAULT 100,
  start_date TEXT NOT NULL,
  end_date TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  billing_amount REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  gst_applicable INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS depl_resource_idx ON deployments(resource_id);
CREATE INDEX IF NOT EXISTS depl_project_idx ON deployments(project_id);
CREATE INDEX IF NOT EXISTS depl_status_idx ON deployments(status);
CREATE INDEX IF NOT EXISTS depl_agreement_idx ON deployments(agreement_id);

CREATE TABLE IF NOT EXISTS agreements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  parent_agreement_id INTEGER,
  agreement_number TEXT,
  title TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'individual',
  currency TEXT NOT NULL DEFAULT 'INR',
  value REAL NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  renewal_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS agr_project_idx ON agreements(project_id);
CREATE INDEX IF NOT EXISTS agr_parent_idx ON agreements(parent_agreement_id);
CREATE INDEX IF NOT EXISTS agr_status_idx ON agreements(status);

CREATE TABLE IF NOT EXISTS agreement_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agreement_id INTEGER NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  billing_amount REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS agrres_agreement_idx ON agreement_resources(agreement_id);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  agreement_id INTEGER REFERENCES agreements(id),
  invoice_number TEXT,
  scope TEXT NOT NULL DEFAULT 'individual',
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  fx_rate_to_inr REAL NOT NULL DEFAULT 1,
  amount REAL NOT NULL,
  gst_amount REAL NOT NULL DEFAULT 0,
  invoice_date TEXT,
  due_date TEXT,
  collected_date TEXT,
  status TEXT NOT NULL DEFAULT 'not_raised',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS inv_project_idx ON invoices(project_id);
CREATE INDEX IF NOT EXISTS inv_agreement_idx ON invoices(agreement_id);
CREATE INDEX IF NOT EXISTS inv_status_idx ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES resources(id)
);
CREATE INDEX IF NOT EXISTS invres_invoice_idx ON invoice_resources(invoice_id);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id),
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  experience_min INTEGER,
  experience_max INTEGER,
  primary_skill TEXT,
  secondary_skill TEXT,
  other_skills TEXT NOT NULL DEFAULT '[]',
  work_mode TEXT,
  location TEXT,
  timezone TEXT,
  engagement_type TEXT,
  required_count INTEGER NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'INR',
  budget_min REAL,
  budget_max REAL,
  deal_value REAL,
  hiring_budget_min REAL,
  hiring_budget_max REAL,
  jd_content TEXT,
  working_days TEXT,
  working_hours TEXT,
  stage TEXT NOT NULL DEFAULT 'requirement',
  priority TEXT DEFAULT 'medium',
  owner TEXT,
  owner_user_id INTEGER,
  next_step TEXT,
  next_step_date TEXT,
  closed_reason TEXT,
  is_listed INTEGER NOT NULL DEFAULT 0,
  listed_at TEXT,
  public_title TEXT,
  public_company_label TEXT,
  show_client_name INTEGER NOT NULL DEFAULT 0,
  share_token TEXT NOT NULL UNIQUE,
  converted_project_id INTEGER REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS opp_stage_idx ON opportunities(stage);
CREATE INDEX IF NOT EXISTS opp_client_idx ON opportunities(client_id);
CREATE INDEX IF NOT EXISTS opp_token_idx ON opportunities(share_token);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER REFERENCES resources(id),
  name TEXT NOT NULL,
  email TEXT,
  mobile TEXT,
  current_designation TEXT,
  experience_years REAL,
  primary_skill TEXT,
  secondary_skill TEXT,
  other_skills TEXT NOT NULL DEFAULT '[]',
  current_ctc REAL,
  expected_ctc REAL,
  notice_period_days INTEGER,
  location TEXT,
  source TEXT NOT NULL DEFAULT 'in_house',
  source_name TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cand_source_idx ON candidates(source);
CREATE INDEX IF NOT EXISTS cand_skill_idx ON candidates(primary_skill);
CREATE INDEX IF NOT EXISTS cand_resource_idx ON candidates(resource_id);

CREATE TABLE IF NOT EXISTS opportunity_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  status TEXT NOT NULL DEFAULT 'mapped',
  interview_round INTEGER NOT NULL DEFAULT 0,
  interview_date TEXT,
  feedback TEXT,
  expected_billing REAL,
  user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(opportunity_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS oppcand_opp_idx ON opportunity_candidates(opportunity_id);
CREATE INDEX IF NOT EXISTS oppcand_cand_idx ON opportunity_candidates(candidate_id);

CREATE TABLE IF NOT EXISTS opportunity_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'internal',
  user_id INTEGER,
  body TEXT NOT NULL,
  is_followup INTEGER NOT NULL DEFAULT 0,
  follow_up_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS oppcomment_opp_idx ON opportunity_comments(opportunity_id);

CREATE TABLE IF NOT EXISTS opportunity_stage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  note TEXT,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS oppstage_opp_idx ON opportunity_stage_history(opportunity_id);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_team_lead INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  referrer_name TEXT NOT NULL,
  referrer_email TEXT,
  referrer_mobile TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT,
  candidate_mobile TEXT,
  experience_years REAL,
  notice_period_days INTEGER,
  current_ctc REAL,
  expected_ctc REAL,
  notes TEXT,
  kind TEXT NOT NULL DEFAULT 'referral',
  status TEXT NOT NULL DEFAULT 'new',
  converted_candidate_id INTEGER REFERENCES candidates(id),
  decided_by_user_id INTEGER,
  referred_by_resource_id INTEGER REFERENCES resources(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS referral_opportunity_idx ON referrals(opportunity_id);
CREATE INDEX IF NOT EXISTS referral_status_idx ON referrals(status);
CREATE INDEX IF NOT EXISTS opp_listed_idx ON opportunities(is_listed);

CREATE TABLE IF NOT EXISTS rating_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'global',
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS crit_scope_idx ON rating_criteria(scope);
CREATE INDEX IF NOT EXISTS crit_opportunity_idx ON rating_criteria(opportunity_id);

CREATE TABLE IF NOT EXISTS candidate_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_candidate_id INTEGER NOT NULL REFERENCES opportunity_candidates(id) ON DELETE CASCADE,
  criterion_id INTEGER NOT NULL REFERENCES rating_criteria(id),
  score INTEGER NOT NULL,
  note TEXT,
  rated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS rating_mapping_idx ON candidate_ratings(opportunity_candidate_id);
CREATE INDEX IF NOT EXISTS rating_criterion_idx ON candidate_ratings(criterion_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  user_id INTEGER,
  user_name TEXT NOT NULL,
  opportunity_id INTEGER REFERENCES opportunities(id),
  candidate_id INTEGER REFERENCES candidates(id),
  title TEXT NOT NULL,
  inputs TEXT NOT NULL DEFAULT '{}',
  output TEXT,
  error TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS agentrun_agent_idx ON agent_runs(agent);
CREATE INDEX IF NOT EXISTS agentrun_opportunity_idx ON agent_runs(opportunity_id);
CREATE INDEX IF NOT EXISTS agentrun_created_idx ON agent_runs(created_at);
`;
