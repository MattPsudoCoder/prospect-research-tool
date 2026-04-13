# Prospect Research — Full Pipeline (20 companies)

Run the complete prospect research pipeline for Matthew's tech recruitment desk at Signify Technology. Find ~20 companies through evidence of active hiring, vet them thoroughly, find hiring managers, and load everything into the tracker.

## ICP Criteria

- **Geography:** United States
- **Company size:** 50–1,500 employees (configurable: `MIN_EMPLOYEES=50`, `MAX_EMPLOYEES=1500`)
- **Exclude:** consulting, staffing, government, nonprofit, agencies
- **Roles:** Software / Frontend / Backend / Mobile / ML engineers + engineering leadership
- **Tech stacks:** TypeScript, React, Node.js, Scala (functional: ZIO, Cats, Cats Effect, Tapir, http4s), Java, Python, Go/Golang, iOS, Android, Flutter
- **NOT interested in:** DevOps, SRE, Platform Engineering roles
- **Signals:** Recent funding, exec hires, expansion, IPO prep, product launches, high job velocity, recent engineering hires

## Configuration (tune after runs)

```
MIN_EMPLOYEES = 50
MAX_EMPLOYEES = 1500
SMALL_COMPANY_THRESHOLD = 250        # Below this, use flat hire count
SMALL_COMPANY_MIN_HIRES = 2          # Minimum recent hires to pass (under threshold)
LARGE_COMPANY_HIRE_PERCENT = 0.5     # Hires as % of headcount (at/above threshold)
DISCOVERY_WINDOW_MONTHS = 4          # How far back to search for new hires
DEDUP_WINDOW_DAYS = 14               # Skip companies researched within this window
BH_GATE_DAYS = 60                    # Bullhorn meaningful activity window
```

### Scoring Weights (configurable)

```
WEIGHT_HIRE_VELOCITY = 0.25          # Recent hires adjusted for company size
WEIGHT_SCALA_FUNCTIONAL = 0.20       # Priority niche bonus (ZIO, Cats, etc.)
WEIGHT_FUNDING_RECENCY = 0.15        # Funding in last 12 months
WEIGHT_OPEN_ROLES = 0.20             # Confirmed open roles from job boards
WEIGHT_KEYWORD_MATCH = 0.20          # How well postings match ICP tech stacks
```

Score = weighted sum, each dimension 0-5, final score 0-5. Hard cutoff at 2.0 — below this, don't push to tracker.

**Score breakdown must be included per company** so Matthew can see why a company ranked where it did.

## Field Requirements

**Required (must have or don't push):**
- Company name
- At least one confirmed signal (recent hires, open role, or funding)
- At least one contact identified

**Optional (populate if available, leave empty if not):**
- ATS detected
- Salary ranges
- Tech stack detail (from postings)
- Funding data
- Specific role URLs

Don't lose a qualified prospect because one optional field is missing.

## Workflow — Execute All Steps

### Step 0: Dedup Against Tracker

Before any research, fetch existing tracker companies:
```bash
curl -s https://prospect-research-tool-production.up.railway.app/api/tracker
```

Extract all company names — **including companies with status "Dropped"**. Skip any company already in the tracker during discovery, regardless of status. This prevents re-researching companies from previous runs, even ones that scored below 2.0.

### Step 1: Discover Companies Through Hiring Evidence

**Two parallel discovery methods. Run both simultaneously.**

#### Step 1a: Job Board Scanning (who's posting roles RIGHT NOW)

Scan job boards for active engineering postings using ICP-specific keywords. Run across ALL available sources:

**API/MCP accessible (search directly):**
- **Indeed** — `search_jobs` with `job_type: "fulltime"`
- **Dice** — `search_jobs` with `employer_types: ["Direct Hire"]` to exclude recruiter/staffing

**Greenhouse/Lever public APIs (search by company slug):**
- **Greenhouse** — `https://api.greenhouse.io/v1/boards/SLUG/jobs`
- **Lever** — `https://api.lever.co/v0/postings/SLUG`

**Web search (use WebSearch tool):**
- **LinkedIn Jobs** — `site:linkedin.com/jobs "react engineer" OR "scala developer"` etc.
- **Built In** — `site:builtin.com/jobs "react" OR "scala" OR "golang"` etc.
- **Wellfound (AngelList)** — `site:wellfound.com/jobs "engineer"` etc.
- **Google for Jobs** — `"software engineer" "react" OR "scala" OR "golang" jobs`

Search keywords across all sources:
- `"react engineer" OR "frontend developer"`
- `"scala developer" OR "java engineer"`
- `"golang engineer" OR "go developer"`
- `"iOS engineer" OR "android engineer" OR "mobile engineer"`

Filter to US, direct hire only (exclude recruiter/staffing postings). Aggregate by company. Any company posting 3+ engineering roles across these searches = actively hiring. Capture the specific role titles, seniority, salary ranges, and tech stacks from the postings.

#### Step 1b: ZoomInfo Talent Movement (who's CLOSING hires)

Search for engineers who recently started new roles — proof of closed hires, not just open postings.

Run these ZoomInfo `search_contacts` queries. All with:
- `department` = "Engineering & Technical"
- `positionStartDateMin` = 4 months ago (configurable: `DISCOVERY_WINDOW_MONTHS`)
- `employeeCount` = "50to99,100to249,250to499,500to999,1000to4999" (filtered to ≤1500 post-search)
- `country` = "United States"
- `pageSize` = 25

**CRITICAL: ALL contact searches must include `country` = "United States".** Do not add contacts based outside the US.

**NON-US CONTACT REJECTION (hard rule — no exceptions):**
- If a contact's phone number has a non-US country code (+972 Israel, +91 India, +44 UK, +381 Serbia, +7 Russia, etc.) → **DELETE the contact entirely**. Do not strip the phone and keep them. A non-US phone number is proof they are not US-based.
- If a contact's name + company context strongly suggests they are based overseas (e.g., Serbian/Israeli names at a company known to have offices in those countries, and no US phone number to confirm US location) → **do not add them**. When in doubt, skip.
- ZoomInfo's `country = "United States"` filter catches most cases, but some overseas contacts slip through because their company HQ is in the US. The phone number is the ground truth.
- Many Israeli/Indian-founded companies (Incode, Tulip, etc.) have engineering leadership overseas that is useless for US recruitment outreach. Be extra vigilant with these companies.

**Rate limiting: stagger searches with 2-3 second delays between each. On 429 responses, back off 30 seconds and retry up to 3 times. Max 3 concurrent ZoomInfo requests at any time.**

**Run these 5 primary searches first (these are the core placement stacks):**

**Search 1 — Frontend/Fullstack:**
- `jobTitle` = "typescript OR react OR node.js OR frontend engineer"

**Search 2 — Backend (JVM):**
- `jobTitle` = "scala OR java OR backend engineer"

**Search 3 — Scala Functional (priority niche):**
- `jobTitle` = "scala" combined with keywords: ZIO, Cats, Cats Effect, Tapir, http4s, functional
- Any company hiring functional Scala engineers is a **top-tier prospect** — flag and prioritise regardless of other scores

**Search 4 — Golang:**
- `jobTitle` = "golang OR go engineer"

**Search 5 — Mobile:**
- `jobTitle` = "iOS OR android OR mobile OR flutter engineer"

**Only run these fallback searches if the 5 primary searches return fewer than 20 unique companies:**

**Fallback 6 — Python/ML:**
- `jobTitle` = "python OR machine learning OR ML engineer"

**Fallback 7 — Engineering Leadership:**
- `jobTitle` = "engineering manager OR VP engineering OR director engineering OR CTO"
- `managementLevel` = "VP Level Exec,Director,C Level Exec,Manager"

After all searches complete, **aggregate by company**. Apply size-aware threshold:
- **Under 250 employees:** 2+ recent engineering hires passes (configurable: `SMALL_COMPANY_MIN_HIRES`)
- **250+ employees:** recent hires ≥ 0.5% of headcount passes (configurable: `LARGE_COMPANY_HIRE_PERCENT`)

Both pass into the pipeline — threshold affects scoring, not filtering. Companies below threshold still enter but score lower on hire velocity.

#### Step 1c: Cross-Reference and Rank

Merge company lists from 1a (job boards) and 1b (talent movement). Companies appearing in BOTH lists are the highest priority — they're hiring so aggressively they're both closing roles and still posting more. Rank by:
1. Companies in both lists (strongest signal)
2. Companies with high talent movement count only (hiring but not posting publicly — internal/referral pipeline)
3. Companies with many job postings only (actively looking but may be earlier in the hiring cycle)

**Fallback: ZoomInfo firmographic search.** If combined discovery returns fewer than 20 unique companies, backfill using `search_companies` with these criteria:
- `industryCodes` = "software" + sub-industries
- `employeeCount` matching ICP range
- `country` = "United States"
- `oneYearEmployeeGrowthRateMin` = 15 (growing companies)
- `fundingStartDate` = 12 months ago, `fundingAmountMin` = 5000 (recently funded)
- Sort by `-revenue` to get established companies, then by `-employeeCount`
- Exclude consulting/staffing by checking industry codes

### Step 2: Bullhorn Gate (Company-Level)

Check if Bullhorn is connected: `curl -s https://prospect-research-tool-production.up.railway.app/api/bullhorn/status`

If connected (`"connected": true`):
- For each company: `curl -s "https://prospect-research-tool-production.up.railway.app/api/bullhorn/check/company?name=COMPANY_NAME"`
- **Gate out** only on **active engagement** in the last 60 days (configurable: `BH_GATE_DAYS`):
  - New job/vacancy added in the last 60 days
  - New placement added
  - Meetings logged
  - Connected calls tracked
- **NOT active engagement** (do NOT gate on these — outreach alone does not grant client ownership):
  - LinkedIn messages or BD messages sent
  - Emails sent
  - Attempted calls (not connected)
  - Mailshots / bulk outreach
  - Company merely existing in Bullhorn as "Prospect"
  - Old unclosed vacancies from months/years ago
  - "Active Account" status with no jobs, placements, meetings, or connected calls
  - Inactive/old placements

If not connected: skip Bullhorn checks, flag all companies for manual BH review, continue.

### Step 3: Verify Hiring (Job Boards)

For each company that passes the gate, search for current open roles using **ICP-specific keywords** (not generic "software engineer"):

**Greenhouse** — public job board: `https://api.greenhouse.io/v1/boards/SLUG/jobs` (no auth needed, this is their public board API — slugify the company name)

**Lever** — public job board: `https://api.lever.co/v0/postings/SLUG` (no auth needed, public API — slugify the company name)

**Indeed MCP** — `search_jobs` with company name + role keywords. Run multiple searches per company:
- `"react engineer" OR "frontend developer"` at COMPANY
- `"scala" OR "java engineer" OR "backend"` at COMPANY
- `"golang" OR "go developer"` at COMPANY
- `"iOS engineer" OR "android" OR "mobile"` at COMPANY
- `"python engineer" OR "machine learning"` at COMPANY

**Dice MCP** — `search_jobs` with same keyword approach as Indeed.

**LinkedIn Jobs, Built In, and Wellfound** should already have been searched in Step 1a via WebSearch. If a company still has zero results across all sources, flag as "no public postings found — may hire via internal/referral pipeline only".

Capture from job boards: specific role titles, seniority levels, salary ranges, tech stacks mentioned, remote/onsite, number of open roles.

### Step 4: Research Each Company

For each qualifying company:

**ZoomInfo data:** employee count, revenue, funding history, industry, growth rate, **website**, **LinkedIn URL** (from `socialMediaUrls` field). Include `socialMediaUrls` in the `requiredFields` for `enrich_companies`. The website and LinkedIn URL must be captured and passed when pushing to the tracker.

**Hire velocity:** count of engineering hires in last 6 months from Step 1 data.

**Web search:** recent funding rounds, executive moves, expansion news, product launches, layoff warnings.

**Score the company** using the weighted formula:
- **Hire velocity** (0.25): recent hires adjusted for company size. Score 5 if well above threshold, 3 if at threshold, 1 if below.
- **Scala/functional match** (0.20): 5 if confirmed Scala functional (ZIO/Cats/etc.), 3 if Scala/Java, 1 if other stack, 0 if no match.
- **Funding recency** (0.15): 5 if funded in last 6 months, 3 if last 12 months, 1 if older, 0 if no funding data.
- **Open roles** (0.20): 5 if 5+ confirmed open eng roles, 3 if 2-4, 1 if 1, 0 if none found.
- **Keyword match** (0.20): how well job postings match ICP tech stacks. 5 = exact match (React/TS/Scala/Go/iOS), 3 = partial, 1 = weak.

Output: overall score (0-5) + per-dimension breakdown with reasoning.

### Step 5: Push Companies to Tracker

For each company scoring ≥ 2.0:
```bash
curl -X POST https://prospect-research-tool-production.up.railway.app/api/tracker \
  -H "Content-Type: application/json" \
  -d '{"name":"COMPANY_NAME","ats_detected":"ATS_NAME","roles_found":"ROLE_DETAILS","hiring_signals":"SIGNALS","keywords":"KEYWORDS","signal_strength":"High|Medium|Low","website":"https://company.com","company_linkedin":"https://www.linkedin.com/company/slug"}'
```

**CRITICAL: `roles_found` vs `hiring_signals` — these are DIFFERENT fields, do not duplicate content:**

- **`roles_found`** = JSON array of clickable links to specific job postings. **NOTHING ELSE.** No descriptions, no counts, no "on staff" text, no career page suggestions. Each entry must have a `title` and `url` pointing to the actual job posting.
  ```json
  [{"title":"Senior Software Engineer","url":"https://boards.greenhouse.io/company/jobs/123"},{"title":"Backend Engineer","url":"https://boards.greenhouse.io/company/jobs/456"}]
  ```
  To get individual role URLs from Greenhouse: `https://api.greenhouse.io/v1/boards/SLUG/jobs` — each job has an `absolute_url` field.
  To get individual role URLs from Lever: `https://api.lever.co/v0/postings/SLUG` — each posting has a `hostedUrl` field.
  If no public ATS jobs are found, set `roles_found` to `"[]"` (empty array). Do NOT fill it with freetext descriptions.

- **`hiring_signals`** = company-level context: funding, employee count, growth rate, location, confirmed hires from ZoomInfo. Example: `"$90M Series C March 2026. 60 employees. Austin TX. 300% YoY bookings growth. Staff Frontend Engineer hire confirmed."`

Do NOT put company descriptions, funding info, employee counts, hire confirmations, or career page links in `roles_found`. That field is strictly for linked job postings.

Signal strength mapping: score ≥ 4.0 = High, ≥ 3.0 = Medium, ≥ 2.0 = Low.

Note the returned `id` — needed for adding contacts.

**Also push companies that scored < 2.0** with `"status":"Dropped"` and no contacts. This prevents them from being re-researched on the next run. They won't appear on the tracker board but will be included in the dedup check.
```bash
curl -X POST https://prospect-research-tool-production.up.railway.app/api/tracker \
  -H "Content-Type: application/json" \
  -d '{"name":"COMPANY_NAME","hiring_signals":"Score: X.X — below 2.0 cutoff. REASON.","signal_strength":"Low","status":"Dropped"}'
```

### Step 6: Find Hiring Managers (ZoomInfo)

For each company, use ZoomInfo `search_contacts`. **Contact lookup order flexes by company size:**

**Under 150 employees:**
1. CTO / Chief Technology Officer
2. VP of Engineering
3. Head of Engineering

**150-500 employees:**
1. VP of Engineering
2. Director of Engineering
3. Head of Engineering

**500+ employees:**
1. Director of Engineering
2. VP of Engineering
3. CTO (still pull — Matthew has a specific use case for CTO contacts at larger companies)

Search with:
- `companyName` = company name
- `managementLevel` = appropriate levels for company size
- `department` = "Engineering & Technical"
- `country` = "United States" **(MANDATORY — never omit this)**

Find ALL relevant hiring decision makers, not an arbitrary cap of 2-3. A 500-person company may have 8-10 engineering leaders who make hiring decisions. Add every VP, Director, and Engineering Manager who is US-based.

If ZoomInfo returns nothing, broaden with `jobTitle` containing "engineering", "CTO", "technical".

### Step 7: Enrich Contacts (ZoomInfo)

Use ZoomInfo `enrich_contacts` to get verified business email and LinkedIn URL. This consumes Bulk Credits (1 per contact). As of April 2026, Matthew has 1,000 bulk credits/month — auto-enrich without asking. If remaining credits drop below 100, flag it.

**POST-ENRICHMENT US VERIFICATION (mandatory before adding to tracker):**
After enrichment, check every contact's phone number. If the returned phone has a non-US country code → **reject the contact entirely, do not add to tracker**. Do not strip the phone and add them anyway — a non-US phone means they are not US-based, period. This is the final gate before contacts enter the system.

### Step 8: Bullhorn Connection Check + Contact Check

**MANDATORY: Verify Bullhorn is connected and token is alive before adding any contacts.**

```bash
curl -s "https://prospect-research-tool-production.up.railway.app/api/bullhorn/ensure-connected"
```

- If `needsRefresh: true` → **STOP and reconnect Bullhorn** by grabbing a fresh token from the user's Chrome browser (open Bullhorn tab → extract BhRestToken from localStorage → POST to /api/bullhorn/token). Do NOT skip this step.
- If `connected: true` → proceed

Then for each contact:
- `curl -s "https://prospect-research-tool-production.up.railway.app/api/bullhorn/search/contact?firstName=FIRST&lastName=LAST"`
- Existing with recent activity → "already in BH — skip"
- Existing but stale → "in BH — update"
- Not found → "new — push"

### Step 9: Add Contacts to Tracker

For each new contact:
```bash
curl -X POST https://prospect-research-tool-production.up.railway.app/api/tracker/COMPANY_ID/contacts \
  -H "Content-Type: application/json" \
  -d '{"name":"FULL NAME","title":"JOB TITLE","linkedin_url":"URL","email":"EMAIL","phone":"PHONE"}'
```

### Step 10: Summary Report

**Summary table:**

| Metric | Count |
|--------|-------|
| Companies discovered (talent movement) | X |
| Companies discovered (firmographic backfill) | X |
| Skipped (already in tracker) | X |
| Passed Bullhorn gate | X |
| Gated out (active in BH) | X |
| Scored ≥ 2.0 (pushed to tracker) | X |
| Scored < 2.0 (dropped) | X |
| Contacts identified | X |
| Contacts enriched | X |
| Contacts added to tracker | X |

**Per-company detail:** For each company pushed, show:
- Company name + employee count + industry
- **Score: X.X** (hire velocity: X, scala match: X, funding: X, open roles: X, keyword match: X)
- Recent eng hires: X in last 4 months
- Open roles found: titles + seniority + comp ranges + source (GH/Lever/Indeed/Dice)
- Hiring signals summary
- Contacts added: names + titles
- Bullhorn status: clear / gated / unchecked

**Priority flags:**
- 🟣 Scala/functional companies (ZIO, Cats, etc.) — always flag these first
- Companies needing LinkedIn Jobs / Built In / Wellfound manual check
- Companies needing LinkedIn sourcing for contacts
- Contacts without email (need enrichment or manual LinkedIn)

**Dropped companies (scored < 2.0):** List with score breakdown so Matthew can override if needed.

## Important Rules

- **Evidence first** — talent movement is the primary discovery method
- **Dedup before research** — check tracker state before every run
- **Check Bullhorn before deep research** — don't waste time on active accounts
- **Search job boards with ICP-specific keywords** — "react engineer", "scala developer", "golang", not "software engineer"
- **Flag Scala functional as priority** — ZIO, Cats, Cats Effect, Tapir, http4s are the specialist niche
- **Contact lookup order matches company size** — CTO at startups, Directors at larger orgs
- **Rate limit ZoomInfo** — stagger calls, back off on 429s, max 3 concurrent
- **Don't guess** — only add contacts ZoomInfo actually returns with verified data
- **US only — HARD REJECT on non-US phone numbers** — if enrichment returns a non-US phone code (+972, +91, +381, +7, +44, etc.), delete the contact entirely. Do NOT strip the phone and keep them. A non-US phone = not US-based = useless for US recruitment. Also reject contacts whose name + company context strongly indicates overseas location even without a phone number.
- **No consulting/staffing/agencies** — hard exclude
- **Disclose API credit costs** before running enrichment
- **Always push changes** — git push after any commits, don't ask
- **Run cadence:** on-demand via `/research`. Can be run daily/weekly — dedup logic prevents re-research within the configured window.
