# Session Handover — Pick Up Here

## MANDATORY WORK RULES
1. **Verify each fix works on the live app before moving to the next one.** Do not batch fixes. Deploy, test the live URL, confirm it works, then move on.
2. **Check what already exists before building anything.** Railway dashboard, env vars, database tables, deployed services — look before you build.
3. **Disclose any costs before incurring them.**
4. **Do not say "verified" or "confirmed" unless you actually tested it against the live app.**
5. **Use Bullhorn REST API, never UI clicking.** Browser token passthrough only.
6. **Never apologize or acknowledge mistakes verbosely — just fix and move on.**

## What This Is
Matthew's prospect research tool for tech recruitment at Signify Technology. App finds companies hiring engineers, scores them, tracks outreach, syncs to Bullhorn CRM.

## Live App
- **URL**: https://prospect-research-tool-production.up.railway.app
- **Deployed on**: Railway (auto-deploys on push to `master`)
- **Database**: Railway Postgres (DATABASE_URL env var on Railway)
- **GitHub**: MattPsudoCoder/prospect-research-tool, `master` branch

## Current State — What Works (as of 2026-04-08 overnight session)

### Everything is functional:
- **Claude API**: ANTHROPIC_API_KEY is set on Railway. `/api/features` returns `claude_api: true`. Key name: "prospect-research-railway" on console.anthropic.com.
- **Pipeline**: Full multi-tier pipeline operational — Greenhouse/Lever APIs (Tier 1), Claude research (Tier 2), scoring, Bullhorn gate, cross-run dedup, US-only filter.
- **Tracker**: 25 companies with 89+ contacts. Cards now show hiring signals, keyword tags, proper ATS display. Step dropdown is compact with visible tips. "Generate Scripts" buttons visible on all contacts.
- **ICP Discovery**: A fresh discovery run ("ICP Discovery — Apr 8 overnight") was kicked off with 19 new companies. Check Prospects page for results.
- **Bullhorn connection**: Manual browser token paste. Bookmarklet CORS issue still unsolved.
- **History page**: 20+ pipeline runs archived.
- **ICP Settings**: US, 100-1000 employees, TS/React/Node/Scala/Java/Python/Go/iOS/Android/Flutter.

### What was fixed this session:
1. **API key on Railway** — Created new key "prospect-research-railway", added to Railway env vars, deployed, verified `claude_api: true` on live URL.
2. **Tracker UI** — Step dropdown was eating all horizontal space due to global `select { width: 100% }` override. Fixed with `width: auto; max-width: 220px`. Step tips now visible.
3. **ATS/Roles "None"** — Tracker cards now show hiring signals summary, keyword tags, and dash instead of "None" for empty fields.
4. **Contacts** — Already working (89+ in DB from previous session). No fix needed.
5. **Generate Scripts** — Auto-fixed by adding the API key. Purple buttons visible on all contacts.
6. **Fresh discovery** — Kicked off ICP discovery run with 19 companies found by Claude.

## Current State — What's Still Broken / Incomplete

### 1. BULLHORN CONNECTION UX IS BAD
Currently requires: open Bullhorn in Chrome > F12 > Console > run two JS commands > copy two values > paste into app. Tokens expire in 10 minutes. The bookmarklet has CORS issues when app is on Railway. Needs a proper fix — options to explore:
- **Proxy endpoint** on Railway that fetches from Bullhorn (requires CORS headers)
- **Chrome extension** that grabs the token and sends it
- **Browser popup** workflow (window.open to Bullhorn, postMessage back)
- **iframe** approach (probably blocked by Bullhorn CSP)

### 2. OLLAMA FOR FREE SCRIPT GENERATION
Matthew has RTX 3080 Ti (12GB VRAM) on his home desktop. Each Claude script generation costs ~$0.02. Explore using Ollama with a local model for script generation to avoid API costs. API would only be used for research (company discovery + signals). This hasn't been built yet.

### 3. PORTALS SYSTEM (lower priority)
Curated list of target companies with career page URLs, monitored daily for new roles. Pinned from earlier conversation.

### 4. OLD API KEY CLEANUP
Key "prospect-research-tool" (sk-ant-api03-C68...rwAA) on console.anthropic.com still exists but is unused. Can be disabled/deleted to avoid confusion. The active key is "prospect-research-railway".

## Infrastructure
| Component | Status | Cost |
|-----------|--------|------|
| Railway app | Live, auto-deploys from master | Trial: ~9 days left, ~$4 remaining, then $5/month |
| Railway Postgres | Live | Included in Railway plan |
| Anthropic API | $5 credits purchased, key on Railway | ~$2-5/month for research usage |
| Bullhorn REST API | Works via browser token | Free (Signify license) |
| ZoomInfo MCP | Connected, not integrated into pipeline yet | Free (Signify license) |
| Indeed MCP | Connected, used for job search | Free |
| Greenhouse/Lever APIs | Working, primary data source | Free |

## Key Technical Details
- **Bullhorn auth**: Browser token passthrough ONLY. OAuth was removed — no CLIENT_SECRET. Token from Bullhorn's localStorage: `BhRestToken` and `rawRestUrl`. Tokens expire ~10 min.
- **Scoring**: 5 dimensions (hiring_activity, company_fit, staffability, signal_freshness, bullhorn_clear), weighted average, hard cutoff at 2.5
- **Pipeline tiers**: Tier 1 = Greenhouse/Lever APIs (free, structured), Tier 2 = Claude web research (needs API key), fallback if Claude unavailable
- **Location filter**: Greenhouse/Lever roles filtered to US/Remote/Americas only (services/ats.js)
- **Cross-run dedup**: Companies researched in last 14 days are skipped
- **Bullhorn 60-day gate**: Companies with meaningful Bullhorn notes in last 60 days are auto-gated

## What Matthew Wants Done (Priority Order)
1. ~~Get the app fully functional~~ — DONE
2. ~~Backfill hiring signals~~ — DONE (all 25 companies have signals)
3. ~~Run a fresh discovery batch~~ — DONE (19 companies running, check Prospects)
4. **Fix Bullhorn connection UX** — research and build a proper solution
5. **Investigate Ollama on home desktop** for free script generation (RTX 3080 Ti)
6. **Build the "portals" system** — curated company list with career page monitoring

## Files That Matter
- `services/bullhorn.js` — Bullhorn REST API integration (browser token auth)
- `services/research.js` — Multi-tier research orchestrator
- `services/scoring.js` — 5-dimension prospect scoring
- `services/ats.js` — Greenhouse/Lever API detection + US location filter
- `services/outreach.js` — Claude-powered outreach script generation
- `services/claude.js` — Claude API wrapper (research, ICP search, ATS fallback)
- `routes/pipeline.js` — Pipeline execution with dedup, gating, scoring
- `routes/tracker.js` — Tracker CRUD + activity logging + step advancement
- `routes/bullhorn.js` — Bullhorn API endpoints (status, connect, search, push, sync)
- `public/js/tracker.js` — Tracker frontend with Bullhorn connection bar
- `public/css/style.css` — All styles
- `PRODUCT_SPEC.md` — Full product spec with architecture and feature roadmap

## Playbook PDFs Location
`C:\Users\matth\OneDrive - Signify Technology\AAAClaudeStuff\Research Pbs\`
- Digital_Asset_Final_Playbook.pdf
- Luxury Presence - Apr 2026.pdf
- M1_Finance_Final_Playbook.pdf
- NerdWallet_Playbook_Final.pdf
- Prospect_List_2026-04-03.pdf

## ICP Settings (on Railway DB)
- Geography: United States
- Company size: 100-1,000 employees
- Exclude: consulting, staffing, government, nonprofit
- Roles: Software/Frontend/Backend/Mobile/DevOps/Platform/ML engineers + engineering leadership
- Tech stacks: TypeScript, React, Node.js, Scala, Java, Python, Go, iOS, Android, Flutter
- Signals: Recent funding, exec hires, expansion, IPO prep, product launches

## Critical Rules (From Memory)
- **ALWAYS check existing infrastructure/deployments/credentials before proposing new ones**
- **ALWAYS disclose financial costs upfront**
- **Use Bullhorn REST API, never UI clicking**
- **Never apologize or acknowledge mistakes verbosely — just fix and move on**
- **Verify before recommending — flag confidence level, don't waste time on uncertain approaches**
