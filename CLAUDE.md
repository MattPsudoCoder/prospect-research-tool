# Prospect Research Tool

Matthew Davie's prospect research app for tech recruitment at Signify Technology. Finds US companies hiring engineers, scores them, tracks outreach, syncs to Bullhorn CRM.

**Live:** https://prospect-research-tool-production.up.railway.app
**Stack:** Node.js + Express, Railway PostgreSQL, vanilla JS frontend
**Deploys:** Auto on push to `master`

## MANDATORY RULES — READ THESE FIRST

1. **Follow the `/research` command exactly.** Every step, in order. No shortcuts. No pushing companies before scoring. No skipping ATS checks.
2. **Verify each fix works on the live app before moving to the next one.** Do not batch fixes.
3. **Check what already exists before building anything.** Railway dashboard, env vars, database tables, deployed services.
4. **Disclose any costs before incurring them.** ZoomInfo enrichment = 1 bulk credit per contact.
5. **Do not say "verified" or "confirmed" unless you actually tested it.**
6. **Use Bullhorn REST API, never UI clicking.** Browser token passthrough only.
7. **Never apologize or acknowledge mistakes verbosely — just fix and move on.**
8. **Always git push after committing. Don't ask.**
9. **ALL contacts must be US-based.** Filter by country=US in ZoomInfo. Reject non-US phone codes (+91, +972, etc). Enforced server-side.
10. **No arbitrary contact caps.** Add every relevant US-based hiring decision maker, not just 2-3.
11. **Score before pushing to tracker.** Hard cutoff at 2.0. Include per-company score breakdowns.
12. **Enrich contacts BEFORE pushing them** — don't push empty contacts and backfill later.
13. **Two enrichment passes for ZoomInfo phone numbers** (ZoomInfo sometimes returns phones on second pass).

## MISTAKES THAT HAVE BEEN MADE — DO NOT REPEAT

- Pushed companies without running the scoring formula — slapped "High" on them
- Pushed contacts without filtering by US location — tracker filled with Israeli/Indian contacts
- Capped contacts at 2-3 per company arbitrarily — the rule is add ALL relevant decision makers
- Skipped ATS checks — pushed companies with empty ATS/Roles fields
- Skipped job board searches during discovery — didn't use Indeed/Dice
- Enriched contacts AFTER pushing — should enrich first, then push with full data
- Backfilled data instead of doing it right the first time — created double the work
- Said "verified" without actually testing on the live app
- Stripped non-US phone numbers and added contacts anyway — a non-US phone means they're overseas, reject them entirely
- Put company descriptions/funding info in `roles_found` — that field is strictly for specific job titles and links, not general company info
- Cloned outreach scripts with name-swap instead of generating per contact — every contact needs individually crafted scripts
- Pushed companies as "Dropped" but POST route didn't accept status field — status was silently ignored, companies showed as "New" with zero contacts
- Didn't run post-pipeline verification checks — contacts went unsynced to Bullhorn, dropped companies appeared as active
- Mapped job title to Bullhorn's `title` field (salutation) instead of `occupation` — every contact pushed had no visible job title in CRM
- Pushed contacts to Bullhorn without email or phone number — CRM filled with unreachable contacts. Never push to BH unless contact has at least email OR phone.
- Parroted the hiring manager's own LinkedIn profile back at them in spec-in emails — candidate profiles must be tailored to the ROLE and its PROBLEMS, not mirror the manager's background

## SERVER-SIDE GUARDRAILS (already enforced in routes/tracker.js)

- Companies pushed without hiring signals → 400
- Contacts with non-US phone numbers (+91, +972, etc.) → 400
- Contacts without email AND without LinkedIn → 400
- Invalid signal strength values → 400
- Invalid email format → 400
- Non-LinkedIn URLs in linkedin_url → 400

## KEY FILES

| File | Purpose |
|------|---------|
| `.claude/commands/research.md` | **THE** research pipeline definition. Follow it exactly. |
| `routes/tracker.js` | Tracker CRUD + validation guardrails |
| `routes/bullhorn.js` | Bullhorn connection, push, sync-day, company check |
| `routes/pipeline.js` | Pipeline runner with SSE progress |
| `services/bullhorn.js` | Bullhorn REST API (browser token auth, 60min TTL) |
| `services/research.js` | Multi-tier research orchestrator |
| `services/scoring.js` | 5-dimension prospect scoring |
| `services/ats.js` | Greenhouse/Lever API + US location filter |
| `services/outreach.js` | Claude-powered per-contact personalized outreach scripts (no cloning) |
| `services/claude.js` | Claude API wrapper (web search for hiring signals) |
| `services/dedup.js` | Cross-run dedup |
| `public/js/tracker.js` | Tracker frontend — STEPS array with bhAction mapping, one-click actions, template viewer |
| `public/js/theme.js` | Dark mode toggle (shared across pages) |
| `db/db.js` | Database connection |
| `db/init.js` | Schema init |

## ARCHITECTURE

- Express server (`server.js`) serves API routes + static HTML pages
- Pages: `/` (dashboard), `/icp`, `/prospects`, `/tracker`, `/history`
- Database: Railway PostgreSQL — tables: `icp_settings`, `pipeline_runs`, `companies`, `tracked_companies`, `tracked_contacts`, `activity_log`
- Bullhorn: REST API via browser token passthrough (grab BhRestToken from Chrome localStorage, POST to `/api/bullhorn/token`). Token expires ~60 min.
- ZoomInfo: MCP tool — NO API keys needed. Call `search_contacts`, `enrich_contacts`, `search_companies` directly. Searches are free. Enrichment costs 1 bulk credit per contact.
- Indeed + Dice: MCP tools for job board scanning.
- Greenhouse/Lever: Public APIs, no auth needed.
- All times display in Central Time (America/Chicago) via `public/js/timezone-utils.js`.

## ICP (Ideal Customer Profile)

- US only, 50-1500 employees
- Tech stacks: TypeScript/React/Node, Scala (ZIO/Cats/Tapir/http4s = priority niche), Java, Python, Go, iOS, Android, Flutter
- NOT DevOps/SRE
- Exclude consulting, staffing, government, nonprofit
- Contact hierarchy: CTO at <150 employees, VP at 150-500, Director at 500+ (CTO always pulled at all sizes). Engineering Manager pulled at ALL company sizes.

## BULLHORN RULES

- 60-day gate: Companies with ACTIVE ENGAGEMENT in last 60 days are auto-discarded.
- **Active engagement means ONLY:** new job/vacancy added, new placement, meetings logged, connected calls. These prove someone is actively working the account.
- **NOT active engagement (do NOT gate on these):** LinkedIn messages, emails sent, attempted calls, mailshots, BD messages, notes without meetings/calls. Outreach alone does not grant client ownership.
- Contacts auto-push to BH when added to tracker (if BH is connected) — **ONLY if contact has email or phone**. Never push empty contacts to CRM.
- Job title maps to `occupation` field on ClientContact, NOT `title` (which is salutation Mr/Mrs/Dr).
- End-of-day sync: "Sync Day" button pushes all unsynced activities as BH Notes with correct action types.
- Each outreach step maps to a BH action type (BD Message, Reverse Market, Attempted BD Call).

## OUTREACH TONE & PERSONALIZATION

- Write as Matthew Davie, consultative and strategic
- Never salesy, never generic
- Short sentences, natural rhythm
- NEVER "I hope this finds you well" or "I wanted to reach out"
- NEVER congratulate on promotions
- One specific, relevant detail beats three generic ones
- Spec-in emails need realistic hypothetical candidate profiles matching the company's ACTUAL tech stack
- Scripts are generated PER CONTACT individually — never clone/swap names
- Seniority-aware tone: CTO gets strategic/peer tone, Director gets practical/direct, Manager gets tactical/specific
- Each script must reference company-specific data: tech stack, open roles, hiring signals
- Value-add emails must contain genuine market insight about the company's specific tech stack
- Batch generation endpoint: POST /api/tracker/:companyId/generate-batch-outreach (force:true to regenerate)
- Bulk regeneration: POST /api/tracker/regenerate-all-scripts

## MEMORY (synced across machines)

Memory files live in `.claude/memory/` inside this repo so they sync via git to all machines. When reading or writing memory, use `.claude/memory/` (relative to project root), NOT the default `~/.claude/projects/` path. Always commit and push memory changes so the other machine gets them.

## DETAILED HANDOVER DOCS

For full context beyond what's here, read these files:
- `SESSION_HANDOVER.md` — latest state, what was done, what's broken
- `SESSION_HANDOVER_APR8_PM.md` — detailed build log from Apr 8
- `PRODUCT_SPEC.md` — full product vision and phase breakdown

## INFRASTRUCTURE

| Component | Status | Cost |
|-----------|--------|------|
| Railway app | Live, auto-deploys from master | ~$5/month |
| Railway Postgres | Live | Included |
| Anthropic API | Active, key on Railway | ~$2-5/month |
| Bullhorn REST API | Works via browser token | Free (Signify license) |
| ZoomInfo MCP | Connected | Bulk credits (check before enriching) |
| Indeed MCP | Connected | Free |
| Greenhouse/Lever | Public APIs | Free |
