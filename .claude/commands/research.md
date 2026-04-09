# Prospect Research — Full Pipeline (20 companies)

Run the complete prospect research pipeline for Matthew's tech recruitment desk at Signify Technology. Find ~20 companies through evidence of active hiring, vet them thoroughly, find hiring managers, and load everything into the tracker.

## ICP Criteria

- **Geography:** United States
- **Company size:** 100–1,000 employees
- **Exclude:** consulting, staffing, government, nonprofit, agencies
- **Roles:** Software / Frontend / Backend / Mobile / ML engineers + engineering leadership (VP Eng, Director Eng, CTO, Head of Eng, Engineering Manager)
- **Tech stacks:** TypeScript, React, Node.js, Scala (functional: ZIO, Cats, Cats Effect, Tapir, http4s), Java, Python, Go/Golang, iOS, Android, Flutter
- **NOT interested in:** DevOps, SRE, Platform Engineering roles
- **Signals:** Recent funding, exec hires, expansion, IPO prep, product launches, high job velocity, recent engineering hires

## Workflow — Execute All Steps

### Step 1: Discover Companies Through Hiring Evidence

**Primary method: ZoomInfo talent movement search.** Search for engineers who recently started new roles — then aggregate by company to find who's actively hiring. This is the strongest signal because it's proof of closed hires, not just open postings.

Run these ZoomInfo `search_contacts` queries in parallel. All with:
- `department` = "Engineering & Technical"
- `positionStartDateMin` = 4 months ago
- `employeeCount` = "100to249,250to499,500to999"
- `country` = "United States"
- `pageSize` = 25

**Search 1 — Frontend/Fullstack:**
- `jobTitle` = "typescript OR react OR node.js OR frontend engineer"

**Search 2 — Backend (JVM/Functional):**
- `jobTitle` = "scala OR java OR backend engineer"

**Search 3 — Scala Functional (high-value niche):**
- `jobTitle` = "scala" combined with keywords: ZIO, Cats, Cats Effect, Tapir, http4s, functional
- This is Matthew's specialist niche — any company hiring functional Scala engineers is a top-tier prospect

**Search 4 — Golang:**
- `jobTitle` = "golang OR go engineer"

**Search 5 — Mobile:**
- `jobTitle` = "iOS OR android OR mobile OR flutter engineer"

**Search 6 — Python/ML:**
- `jobTitle` = "python OR machine learning OR ML engineer"

**Search 7 — Engineering Leadership:**
- `jobTitle` = "engineering manager OR VP engineering OR director engineering OR CTO"
- `managementLevel` = "VP Level Exec,Director,C Level Exec,Manager"

After all searches complete, **aggregate by company**. Any company that appears 2+ times across searches is actively hiring in Matthew's space. Rank by frequency — companies with the most recent hires across multiple role types are the best prospects.

**Secondary method: ZoomInfo company search.** Supplement with `search_companies` using ICP criteria (industry, size, location, funding, growth rate) to fill gaps if talent movement search returns fewer than 20 unique companies.

**Tertiary method: Job board verification.** For the top companies from talent movement, verify current open roles:
- Greenhouse API: `https://api.greenhouse.io/v1/boards/SLUG/jobs`
- Lever API: `https://api.lever.co/v0/postings/SLUG`
- Indeed MCP: `search_jobs` with company name + role-specific keywords (NOT just "software engineer" — use actual ICP role keywords: "react engineer", "scala developer", "iOS engineer", "golang", etc.)
- Dice MCP: `search_jobs` with company name + role keywords

Capture from job boards: specific role titles, seniority levels, salary ranges, tech stacks mentioned, remote/onsite, number of open roles.

### Step 2: Check Bullhorn (Company-Level Gate)

Check if Bullhorn is connected: `curl -s https://prospect-research-tool-production.up.railway.app/api/bullhorn/status`

If connected (`"connected": true`):
- For each company, check Bullhorn via: `curl -s "https://prospect-research-tool-production.up.railway.app/api/bullhorn/check/company?name=COMPANY_NAME"`
- **Gate out** only if there is **meaningful recent activity** in the last 60 days. Meaningful = evidence of actual human engagement:
  - Notes from a BD/account manager (connected calls, meeting notes, outreach logs)
  - Vacancies added in the last 60 days (not stale unclosed ones from years ago)
  - Active placements (status = Active or Approved)
  - Recent leads with activity
- **NOT meaningful** (do NOT gate on these alone):
  - Company merely existing in Bullhorn as "Prospect" with no notes/activity
  - Old unclosed vacancies from months/years ago (bad CRM hygiene, not live work)
  - "Active Account" status with no recent notes, calls, or new vacancies
  - Inactive/old placements
- Flag companies that exist in Bullhorn but have no meaningful recent activity — these are fair game

If not connected: skip Bullhorn checks, flag all companies for manual BH review later, and continue.

### Step 3: Research Each Company

For each company that passes the Bullhorn gate, gather:

**From ZoomInfo:** `search_companies` or `enrich_companies` for employee count, revenue, funding history, industry, growth rate.

**From ZoomInfo new hires:** Count of engineering hires in last 6 months (using `positionStartDateMin`). This tells you the velocity of hiring.

**From job boards (Step 1 results):** Open roles, seniority, salary ranges, tech stacks.

**From web search:** Recent funding rounds, executive moves, expansion news, product launches, layoff warnings.

**Compile per company:**
- Hiring signals summary
- Tech stack (confirmed from job postings, not guessed)
- Keywords for tracker
- Signal strength (High/Medium/Low based on evidence)
- Role details: what specific roles, what level, what comp

### Step 4: Push Qualifying Companies to Tracker

For each company:
```bash
curl -X POST https://prospect-research-tool-production.up.railway.app/api/tracker \
  -H "Content-Type: application/json" \
  -d '{"name":"COMPANY_NAME","ats_detected":"ATS_NAME","roles_found":"ROLE_DETAILS","hiring_signals":"SIGNALS","keywords":"KEYWORDS","signal_strength":"High"}'
```

Populate ALL fields — no empty ATS or roles fields. If we couldn't determine ATS, say "Unknown" not empty.

Note the returned `id` — needed for adding contacts.

### Step 5: Find Hiring Managers via ZoomInfo

For each qualifying company, use ZoomInfo `search_contacts` with:
- `companyName` = company name
- `managementLevel` = "VP Level Exec,Director,C Level Exec"
- `department` = "Engineering & Technical"
- Target **2–3 contacts per company**

Priority titles (in order):
1. VP of Engineering / VP Engineering
2. CTO / Chief Technology Officer
3. Head of Engineering
4. Director of Engineering
5. Engineering Manager

Capture: name, title, email, phone, LinkedIn URL.

If ZoomInfo returns no engineering leadership, try `search_contacts` with broader title keywords: "engineering", "CTO", "technical".

### Step 6: Enrich Contacts

Use ZoomInfo `enrich_contacts` to get verified business email and LinkedIn URL for each contact. **Flag the credit cost before running** — enrichment consumes ZoomInfo Bulk Credits.

### Step 7: Check Contacts Against Bullhorn

If Bullhorn is connected:
- For each contact, search via: `curl -s "https://prospect-research-tool-production.up.railway.app/api/bullhorn/search/contact?firstName=FIRST&lastName=LAST"`
- If contact exists with recent activity, flag as "already in BH — skip"
- If contact exists but stale, flag as "in BH — update"
- If contact doesn't exist, mark as "new — push"

If not connected: mark all as "BH unchecked" and continue.

### Step 8: Add Contacts to Tracker

For each new contact:
```bash
curl -X POST https://prospect-research-tool-production.up.railway.app/api/tracker/COMPANY_ID/contacts \
  -H "Content-Type: application/json" \
  -d '{"name":"FULL NAME","title":"JOB TITLE","linkedin_url":"URL","email":"EMAIL","phone":"PHONE"}'
```

### Step 9: Summary Report

After completing all steps, provide:

**Summary table:**

| Metric | Count |
|--------|-------|
| Companies discovered (talent movement) | X |
| Companies discovered (firmographic search) | X |
| Passed Bullhorn gate | X |
| Gated out (active in BH) | X |
| Added to tracker | X |
| Contacts identified | X |
| Contacts enriched | X |
| Contacts added to tracker | X |
| Bullhorn status | Connected / Not connected |

**Per-company detail:** For each company added, show:
- Company name + employee count + industry
- Number of recent eng hires (from talent movement search)
- Open roles found (from job boards) with titles + seniority + comp ranges
- Hiring signals
- Contacts added (names + titles)
- Bullhorn status (clear / gated / unchecked)

**Gaps & flags:**
- Companies needing LinkedIn sourcing for contacts
- Companies with no verified open roles (lower confidence)
- Contacts without email (need enrichment or LinkedIn)
- Any Scala/functional companies found (flag as priority)

## Important Rules

- **Evidence first** — talent movement search is the primary discovery method, not firmographic guessing
- **Check Bullhorn before deep research** — don't waste time on companies already being worked
- **Populate all tracker fields** — no empty ATS, roles, or signals fields
- **Search job boards with ICP-specific keywords** — not generic "software engineer"
- **Flag Scala functional companies as priority** — ZIO, Cats, Cats Effect, Tapir, http4s are Matthew's specialist niche
- **Don't guess titles** — only add contacts ZoomInfo actually returns with verified data
- **US only** — skip any company or contact outside the United States
- **No consulting/staffing/agencies** — hard exclude, even if ZoomInfo returns them
- **Disclose any API credit costs** if a ZoomInfo enrichment would consume credits
- **If rate-limited**, wait and retry — don't skip companies silently
- **Always push changes** — git push after any commits, don't ask
