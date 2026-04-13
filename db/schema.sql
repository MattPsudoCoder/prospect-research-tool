-- Prospect Research Tool — Database Schema

CREATE TABLE IF NOT EXISTS icp_settings (
    id SERIAL PRIMARY KEY,
    industry_sector TEXT NOT NULL DEFAULT '',
    company_size_min INTEGER DEFAULT 0,
    company_size_max INTEGER DEFAULT 0,
    geography TEXT NOT NULL DEFAULT '',
    role_types TEXT NOT NULL DEFAULT '',
    hiring_signals TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Migration: add hiring_signals column if it doesn't exist
ALTER TABLE icp_settings ADD COLUMN IF NOT EXISTS hiring_signals TEXT;

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    total_companies INTEGER DEFAULT 0,
    processed_companies INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  );

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    ats_detected TEXT DEFAULT '',
    roles_found TEXT DEFAULT '',
    hiring_signals TEXT DEFAULT '',
    keywords TEXT DEFAULT '',
    signal_strength TEXT DEFAULT '',
    in_bullhorn BOOLEAN DEFAULT FALSE,
    bullhorn_status TEXT DEFAULT '',
    last_activity TEXT DEFAULT '',
    raw_research JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

CREATE TABLE IF NOT EXISTS tracked_companies (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    ats_detected TEXT DEFAULT '',
    roles_found TEXT DEFAULT '',
    hiring_signals TEXT DEFAULT '',
    keywords TEXT DEFAULT '',
    signal_strength TEXT DEFAULT '',
    status TEXT DEFAULT 'New',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

CREATE TABLE IF NOT EXISTS tracked_contacts (
    id SERIAL PRIMARY KEY,
    tracked_company_id INTEGER REFERENCES tracked_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT DEFAULT '',
    linkedin_url TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    outreach_step INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Migration: add tech_stack column
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tech_stack TEXT DEFAULT '';

-- Migration: add dismissed column for soft-delete on prospects
ALTER TABLE companies ADD COLUMN IF NOT EXISTS dismissed BOOLEAN DEFAULT FALSE;

-- v1.1 scoring columns on companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS score_overall NUMERIC(3,1) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS score_details JSONB DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS recommendation TEXT DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS signal_types TEXT DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gated_out BOOLEAN DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gate_reason TEXT DEFAULT '';

-- v1.1 outreach templates on tracked_contacts
ALTER TABLE tracked_contacts ADD COLUMN IF NOT EXISTS outreach_templates JSONB DEFAULT '{}';
ALTER TABLE tracked_contacts ADD COLUMN IF NOT EXISTS step_updated_at TIMESTAMPTZ DEFAULT NULL;

-- v1.1 activity log
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    tracked_contact_id INTEGER REFERENCES tracked_contacts(id) ON DELETE CASCADE,
    bullhorn_contact_id INTEGER,
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    synced_to_bullhorn BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bullhorn sync columns on tracked_contacts
ALTER TABLE tracked_contacts ADD COLUMN IF NOT EXISTS bullhorn_id INTEGER DEFAULT NULL;
ALTER TABLE tracked_contacts ADD COLUMN IF NOT EXISTS bullhorn_synced_at TIMESTAMPTZ DEFAULT NULL;

-- v1.2 ATS slug override for scan feature
ALTER TABLE tracked_companies ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE tracked_companies ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '';
ALTER TABLE tracked_companies ADD COLUMN IF NOT EXISTS company_linkedin TEXT DEFAULT '';
ALTER TABLE tracked_companies ADD COLUMN IF NOT EXISTS ats_slug TEXT DEFAULT '';
-- v1.2 last ATS scan timestamp and role snapshot
ALTER TABLE tracked_companies ADD COLUMN IF NOT EXISTS ats_last_scanned TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tracked_companies ADD COLUMN IF NOT EXISTS ats_role_snapshot JSONB DEFAULT NULL;

-- Seed a default ICP row if none exists
INSERT INTO icp_settings (industry_sector, company_size_min, company_size_max, geography, role_types)
SELECT 'Technology', 50, 5000, 'United States', 'Software Engineer, Product Manager, Data Scientist'
WHERE NOT EXISTS (SELECT 1 FROM icp_settings LIMIT 1);
