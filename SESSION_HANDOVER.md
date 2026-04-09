# Session Handover — Pick Up Here

## MANDATORY WORK RULES
1. **Follow the `/research` command exactly.** Every step, in order. No shortcuts. No pushing companies before scoring. No skipping ATS checks.
2. **Verify each fix works on the live app before moving to the next one.** Do not batch fixes.
3. **Check what already exists before building anything.** Railway dashboard, env vars, database tables, deployed services.
4. **Disclose any costs before incurring them.** ZoomInfo enrichment = 1 bulk credit per contact. 892 remaining as of Apr 9.
5. **Do not say "verified" or "confirmed" unless you actually tested it.**
6. **Use Bullhorn REST API, never UI clicking.** Browser token passthrough only.
7. **Never apologize or acknowledge mistakes verbosely — just fix and move on.**
8. **Always git push after committing. Don't ask.**
9. **ALL contacts must be US-based.** Filter by country=US in ZoomInfo. Reject non-US phone codes (+91, +972, etc). This is enforced server-side now.
10. **No arbitrary contact caps.** Add every relevant US-based hiring decision maker, not just 2-3.

## What This Is
Matthew's prospect research tool for tech recruitment at Signify Technology. Finds companies hiring engineers, scores them, tracks outreach, syncs to Bullhorn CRM.

## Live App
- **URL**: https://prospect-research-tool-production.up.railway.app
- **Deployed on**: Railway (auto-deploys on push to `master`)
- **Database**: Railway Postgres
- **GitHub**: MattPsudoCoder/prospect-research-tool, `master` branch

## Current State (as of 2026-04-09)

### What works:
- **Full pipeline**: Greenhouse/Lever APIs, Claude research, scoring, Bullhorn gate, cross-run dedup, US-only filter
- **Tracker**: 62 companies with enriched contacts (emails, LinkedIn, phones). Dark mode toggle. Search + step filter.
- **Bullhorn**: Browser token passthrough. Auto-pushes contacts on add. Token expires ~10 min.
- **`/research` command**: Comprehensive 12-step pipeline. Talent movement discovery + job board scanning. Scoring formula. US-only contacts. Available via `/research` in any Claude Code session.
- **Server-side guardrails**: API rejects companies without hiring signals, contacts with non-US phones, contacts without email/LinkedIn, invalid signal strengths.
- **ZoomInfo MCP**: Connected. Searches are free. Enrichment costs 1 bulk credit per contact (892 remaining of 1000/month).
- **Indeed + Dice MCPs**: Connected for job board scanning.
- **Dark mode**: Toggle in sidebar on all pages, persists via localStorage.
- **Tracker filter**: Search by company name, filter by outreach step.

### What was done this session:
1. **Dark mode toggle** added to all 5 pages
2. **Tracker search + step filter** added
3. **`/research` slash command** created and iterated extensively
4. **40 companies researched** via ZoomInfo (2 batches of 20)
5. **~100 contacts** identified, enriched, pushed to tracker
6. **Bullhorn gate checks** on all companies (all clear except airSlate)
7. **ATS checks** via Greenhouse/Lever on all companies (17 had public boards)
8. **Non-US contact cleanup** — removed 29 non-US contacts, added 17 US replacements
9. **Dead record cleanup** — removed 12 companies with zero contacts or no actionable data
10. **PATCH endpoint** added for tracked companies (was missing)
11. **Server-side guardrails** added to tracker API (rejects bad data)
12. **Life360** researched as example of full pipeline execution — 9 contacts, all enriched, score 3.8

### What went wrong this session (learn from this):
- **Pushed companies without scoring** — slapped "High" on companies without running the formula
- **Didn't filter contacts by US location** — tracker filled with Israeli/Indian contacts
- **Capped contacts at 2-3 arbitrarily** — command says add all relevant decision makers
- **Skipped ATS checks** — pushed companies with empty ATS/Roles fields
- **Skipped job board searches** — didn't use Indeed/Dice during discovery
- **Enriched contacts AFTER pushing** — should enrich first, then push with full data
- **Backfilled data instead of doing it right** — created double the work

### Server-side guardrails now prevent:
- Companies pushed without hiring signals → 400
- Contacts with non-US phone numbers (+91, +972, etc.) → 400
- Contacts without email AND without LinkedIn → 400
- Invalid signal strength values → 400
- Invalid email format → 400
- Non-LinkedIn URLs in linkedin_url → 400

## `/research` Command — The Process

Available via `/research` in any Claude Code session. Full details in `.claude/commands/research.md`. Summary:

**Step 0**: Dedup against tracker
**Step 1a**: Job board scanning — Indeed, Dice, Greenhouse, Lever, LinkedIn Jobs, Built In, Wellfound, Google for Jobs. ICP-specific keywords not generic "software engineer".
**Step 1b**: ZoomInfo talent movement — engineers who recently started roles (proof of closed hires)
**Step 1c**: Cross-reference and rank — companies in both lists = highest priority
**Step 2**: Bullhorn gate — meaningful activity only (notes, calls, recent vacancies, active placements). Not stale CRM entries.
**Step 3**: Verify hiring — Greenhouse/Lever APIs + Indeed/Dice per company
**Step 4**: Research + Score — 5-dimension weighted formula (hire velocity 0.25, scala/functional 0.20, funding 0.15, open roles 0.20, keyword match 0.20). Hard cutoff at 2.0.
**Step 5**: Push companies to tracker — all fields populated
**Step 6**: Find contacts — ZoomInfo, country=US mandatory, no arbitrary cap, hierarchy flexes by company size
**Step 7**: Enrich contacts — auto-enrich, flag if credits < 100
**Step 8**: Bullhorn contact check
**Step 9**: Add contacts to tracker — with email, LinkedIn, phone
**Step 10**: Summary report with per-company score breakdowns

### Key config (in the command file):
```
MIN_EMPLOYEES = 50
MAX_EMPLOYEES = 1500
SMALL_COMPANY_THRESHOLD = 250
SMALL_COMPANY_MIN_HIRES = 2
LARGE_COMPANY_HIRE_PERCENT = 0.5
DISCOVERY_WINDOW_MONTHS = 4
DEDUP_WINDOW_DAYS = 14
BH_GATE_DAYS = 60
```

### ICP:
- US only, 50-1500 employees
- TS/React/Node, Scala (ZIO/Cats/Tapir/http4s = priority niche), Java, Python, Go, iOS, Android, Flutter
- NOT DevOps/SRE
- Exclude consulting, staffing, government, nonprofit
- Contact hierarchy: CTO at <150, VP at 150-500, Director at 500+ (CTO always pulled at all sizes)

## What's Still Broken / Incomplete

### 1. BULLHORN CONNECTION UX
Still requires F12 console token paste. Expires every 10 min. Needs a proper fix (proxy endpoint, Chrome extension, or popup flow).

### 2. EXISTING 62 TRACKER COMPANIES ARE MIXED QUALITY
The batch 1+2 companies (IDs 34-73) were pushed without following the full process. Some have good data (Life360 = excellent), many don't. The companies from the original pipeline runs (IDs 2-27) have pipeline-generated data. New companies added via `/research` going forward will be properly vetted.

### 3. OLLAMA FOR FREE SCRIPT GENERATION
Matthew has RTX 3080 Ti. Each Claude script generation costs ~$0.02. Not built yet.

### 4. PORTALS SYSTEM
Curated list of target companies with career page URLs, monitored daily for new roles. Not built.

### 5. CONTACT ENRICHMENT FOR OLD TRACKER COMPANIES
The original 33 companies (IDs 2-27) from previous sessions don't have enriched contacts. Many have no contacts at all.

## Infrastructure
| Component | Status | Cost |
|-----------|--------|------|
| Railway app | Live, auto-deploys from master | Trial → $5/month |
| Railway Postgres | Live | Included |
| Anthropic API | Active, key on Railway | ~$2-5/month |
| Bullhorn REST API | Works via browser token | Free (Signify license) |
| ZoomInfo MCP | Connected | 892/1000 bulk credits remaining |
| Indeed MCP | Connected | Free |
| Dice MCP | Connected | Free |
| Greenhouse/Lever | Public APIs, no auth needed | Free |

## Key Files
- `.claude/commands/research.md` — **THE** research pipeline definition. Follow it exactly.
- `routes/tracker.js` — Tracker CRUD + validation guardrails
- `services/bullhorn.js` — Bullhorn REST API (browser token auth)
- `services/research.js` — Multi-tier research orchestrator
- `services/scoring.js` — 5-dimension prospect scoring
- `services/ats.js` — Greenhouse/Lever API + US location filter
- `services/outreach.js` — Claude-powered outreach script generation
- `services/claude.js` — Claude API wrapper
- `routes/pipeline.js` — Pipeline execution
- `public/js/tracker.js` — Tracker frontend with filter + dark mode
- `public/js/theme.js` — Dark mode toggle (shared across pages)
- `public/css/style.css` — All styles including dark mode overrides

## Playbook PDFs Location
`C:\Users\matth\OneDrive - Signify Technology\AAAClaudeStuff\Research Pbs\`

## Critical Rules (From Memory)
- **Follow `/research` command exactly — no shortcuts, no skipping steps**
- **ALL contacts must be US-based — enforced server-side**
- **Score before pushing — hard cutoff at 2.0**
- **Check existing infrastructure before proposing new**
- **Disclose financial costs upfront**
- **Use Bullhorn REST API, never UI clicking**
- **Never apologize verbosely — just fix and move on**
- **Always git push after committing**
- **Verify before recommending — flag confidence level**
