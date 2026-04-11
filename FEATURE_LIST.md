# Prospect Research Tool — Feature List

## What It Is
A web app for tech recruitment prospect research at Signify Technology. Finds US companies hiring engineers, scores them against your ICP, tracks outreach, and syncs everything to Bullhorn CRM.

**Live:** https://prospect-research-tool-production.up.railway.app
**Stack:** Node.js + Express, Railway PostgreSQL, vanilla JS frontend
**Cost:** ~$5/month Railway + ~$2-5/month Anthropic API

---

## VERIFIED WORKING FEATURES

### 1. Multi-Source Research Pipeline
**Status: Fully built, verified across 62 companies**

- **Manual input:** Paste company names (comma or newline separated)
- **CSV upload:** Single-column company lists
- **ZoomInfo CSV:** Auto-detects "Company Name" column from ZoomInfo exports
- **ICP-based Claude search:** Toggle to have Claude find companies matching your ICP via web search
- **Real-time SSE progress bar** during pipeline runs
- **Cross-run deduplication** (14-day window) — won't re-research companies you've already processed

### 2. ATS Detection & Job Board Scraping
**Status: Verified working for Greenhouse, Lever, Ashby**

- **Greenhouse API** (`api.greenhouse.io/v1/boards/{slug}/jobs`) — no auth needed
- **Lever API** (`api.lever.co/v0/postings/{slug}`) — no auth needed
- **Ashby** (`jobs.ashbyhq.com/{slug}`) — web scraping
- Automatically slugifies company names and tries common variations
- Filters roles by ICP keywords (35+ tech role patterns) and US geography
- Returns: ATS type, total roles, relevant role count, specific titles

### 3. 5-Dimension Prospect Scoring
**Status: Verified working, hard cutoff at 2.0**

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Hiring Activity | 1.5x | Role count, ICP role matches |
| Company Fit | 1.0x | Funding, growth signals, exec hires |
| Staffability | 1.2x | What % of roles match your desk |
| Signal Freshness | 0.8x | How recent are the hiring signals |
| Bullhorn Clear | 1.5x | Not being actively worked by colleagues |

Score >= 4.0 = High, >= 3.0 = Medium, >= 2.0 = Low, < 2.0 = auto-discard

### 4. Company Tracker
**Status: Verified working, 62 companies actively tracked**

- Add companies from prospects page (one-click) or manually via API
- Each company card shows: signal strength badge, ATS detected, roles found, hiring signals
- Update any field (PATCH): signal_strength, roles_found, hiring_signals, ats_detected, keywords, notes, status
- Filter by signal strength, search by name
- Delete companies that don't belong

### 5. Contact Management
**Status: Verified working, 250+ contacts tracked**

- Add contacts per company: name, title, LinkedIn URL, email, phone
- **Server-side US validation:** Rejects non-US phone codes (+91 India, +972 Israel, +44 UK, etc.)
- **Required fields:** Must have email OR LinkedIn (or both)
- Edit contacts inline (title, email, phone, LinkedIn, notes)
- Delete contacts
- Contact hierarchy follows ICP: CTO at <150 emp, VP at 150-500, Director at 500+

### 6. Bullhorn CRM Integration
**Status: Verified working, 252 contacts synced**

- **Browser token passthrough:** Grab BhRestToken + restUrl from Chrome localStorage, POST to `/api/bullhorn/token`
- Token TTL: ~60 minutes (re-grab from Chrome when expired)
- **Auto-push on contact add:** When you add a contact to tracker, it auto-searches Bullhorn and creates/links the contact
- **Backfill endpoint:** `POST /api/tracker/backfill-bullhorn` — syncs all unlinked contacts in one shot
- **Company check:** Deep analysis of Bullhorn history (notes, vacancies, placements, leads, negative signals)
- **60-day gate:** Auto-discards companies with active engagement (jobs, placements, meetings, connected calls) in last 60 days
- **NOT gated on:** LinkedIn messages, emails, attempted calls, mailshots (outreach alone != ownership)

### 7. ZoomInfo Integration (via MCP)
**Status: Verified working, used for company enrichment and contact discovery**

- `search_contacts` — Free searches for hiring decision makers
- `enrich_contacts` — 1 bulk credit per contact (email, phone, LinkedIn)
- `search_companies` — Free company searches
- `enrich_companies` — Company enrichment (employee count, funding, revenue, tech stack)
- `account_research` — AI-powered company research summaries
- Two-pass enrichment for phone numbers (ZoomInfo sometimes returns phones on second pass)

### 8. Outreach Template Generation
**Status: Built, partially verified**

- Claude-powered personalized outreach for 6-step cadence:
  1. LinkedIn connection request
  2a. Intro message (if accepted)
  2b. InMail (if not accepted)
  3. Spec-in email (with hypothetical candidate profile)
  4. Cold call script + voicemail + SMS follow-up
  5. Value-add email
  6. LinkedIn follow-up
- **Clone function:** Generates templates for first contact, then clones for others at same company (saves API cost)
- Tone: Consultative, strategic, never salesy. No "I hope this finds you well."

### 9. Activity Logging & Bullhorn Sync
**Status: Built, partially verified**

- Log activities per contact: calls, emails, messages
- Each outreach step maps to a Bullhorn action type (BD Message, Reverse Market, Attempted BD Call)
- **Sync Day button:** Pushes all unsynced activities as Bullhorn Notes with correct action types
- Track which activities have been synced vs pending

### 10. Frontend Pages
**Status: All verified working on live app**

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/` | Run research pipelines, view progress |
| Prospects | `/prospects` | Browse all qualified prospects, add to tracker |
| Tracker | `/tracker` | Manage companies, contacts, outreach |
| ICP Settings | `/icp` | Configure ideal customer profile |
| History | `/history` | View past pipeline runs, export results |

- **Dark mode** toggle on all pages
- **Central Time** display (America/Chicago) across all timestamps
- **CSV export** from prospects and history pages

### 11. Server-Side Guardrails
**Status: Verified enforced in production**

- Companies pushed without hiring signals → 400 error
- Contacts with non-US phone numbers → 400 error
- Contacts without email AND without LinkedIn → 400 error
- Invalid signal strength values → 400 error
- Invalid email format → 400 error
- Non-LinkedIn URLs in linkedin_url field → 400 error

### 12. Data Quality Audit System
**Status: Verified working (just completed full audit of 62 companies)**

- ZoomInfo enrichment for employee counts, funding, revenue, HQ location
- Career page scraping for actual role data
- ICP violation detection: employee count range (50-1,500), US geography, tech stack match
- Signal strength re-grading based on real data
- Hiring signal verification (not just "High" — actual role counts and specifics)

---

## INFRASTRUCTURE

| Component | Status | Cost |
|-----------|--------|------|
| Railway app | Live, auto-deploys from `master` | ~$5/month |
| Railway Postgres | Live, 6 tables | Included |
| Anthropic API | Active | ~$2-5/month |
| Bullhorn REST API | Working via browser token | Free (Signify license) |
| ZoomInfo MCP | Connected | Bulk credits (~815 remaining) |
| Indeed MCP | Connected | Free |
| Greenhouse/Lever | Public APIs | Free |

---

## CURRENT TRACKER STATE (as of April 2026)

- **62 total companies**
- **22 High signal** — all with verified ATS, specific roles, funding/revenue data
- **19 Medium signal** — all with verified career data
- **21 Low signal** — ICP violations or non-viable (flagged with specific reasons)
- **250+ contacts** — all US-based, all synced to Bullhorn
- **0 data gaps** — every High/Medium company has roles_found and hiring_signals populated
