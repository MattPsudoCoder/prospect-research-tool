# Prospect Research Tool — Product Spec

## Vision
Bullhorn is the system of record. This app is the daily cockpit.
Every morning: open the app, see prospects, click through outreach steps, sync to Bullhorn at end of day.

## User
Matthew Davie — solo user, 10+ years technical recruitment at Signify Technology.
Places software engineers (TypeScript, Scala, Node.js, mobile, Go, Rust) at US tech companies.

---

## The Pipeline (5 Phases)

### Phase 1: RESEARCH (Automated)
**Status: Built**

Set ICP criteria → Run pipeline → Claude web search + ATS detection + Bullhorn company check.

**Bullhorn gate (critical rule):**
- Before a company enters the prospect list, check Bullhorn for that company
- If company exists AND has meaningful notes within 60 days → AUTO-DISCARD
- If company exists but no activity in 60+ days → QUALIFIES (fair game)
- If company doesn't exist in Bullhorn → QUALIFIES
- This prevents stepping on colleagues' active accounts
- Only checks company-level notes, not individual contacts

**Sources:** Manual entry, CSV upload, ZoomInfo CSV, Claude ICP search, Indeed job search, web search.

**Output:** Prospect list with hiring signals, ATS info, roles found, signal strength.

### Phase 2: QUALIFY (Manual Review)
**Status: Built**

- Review prospects — filter by signal strength, roles, keywords
- Good lead → Track (move to Tracker)
- Bad lead → Skip / Delete
- This is Matthew's judgment call — the app surfaces data, he decides

### Phase 3: ENRICH CONTACTS (Automated)
**Status: Partially built — ZoomInfo integration needed in app**

For each tracked company:
1. ZoomInfo `search_contacts` — filter by company, department (Engineering & Technical), management level (VP, Director, Manager)
2. Get 2-5 contacts per company
3. ZoomInfo `enrich_contacts` — get email, mobile phone, LinkedIn URL
4. **Two enrichment passes for phone numbers** (ZoomInfo sometimes returns phones on second pass)
5. Only check Bullhorn for contact conflicts IF the company was flagged in Phase 1 as having some BH presence but stale activity (60+ days). Brand new companies skip this check.

**Output:** Contact list with name, title, email, mobile, LinkedIn, company — ready for outreach.

### Phase 4: DAILY ACTION BOARD (Tracker)
**Status: Skeleton built — needs one-click actions + message templates**

The Tracker becomes the main daily interface. For each contact, a 6-step outreach cadence:

| Step | Channel | What Happens on Click |
|------|---------|----------------------|
| 1. LinkedIn Connect | LinkedIn | Opens profile + connection message (< 300 chars) |
| 2a. Intro (accepted) | LinkedIn | Personalised opener + question |
| 2b. Intro (not accepted) | LinkedIn | Lead with relevance + CTA |
| 3. Spec-in Email | Email | Opens compose with tailored candidate profile email |
| 4. Cold Call | Phone | Shows number + call script + voicemail + follow-up text |
| 5. Value-add Email | Email | Market insight email |
| 6. LinkedIn Follow-up | LinkedIn | References candidate from Step 3 |

**One-click workflow:** Click step → content surfaces → do the action → mark done.

**Message generation rules (tone):**
- Write as Matthew Davie, consultative and strategic
- Never salesy, never generic
- Short sentences, natural rhythm
- Never "I hope this finds you well" or "I wanted to reach out"
- One specific, relevant detail beats three generic ones
- Never congratulate on promotions
- Spec-in emails need realistic, hypothetical candidate profiles tailored to the company

### Phase 5: END-OF-DAY SYNC
**Status: Foundation built — needs batch reconciliation button**

- One button: "Sync to Bullhorn"
- Pushes all day's activity in bulk:
  - New contacts created
  - Notes for every outreach action (call, email, message)
  - Step changes logged
- Managers at Signify see activity in Bullhorn CRM

---

## What's Built vs What's Next

### Done
- [x] Pipeline research (Claude + ATS detection)
- [x] Prospects page with filtering and export
- [x] Tracker with 6-step outreach pipeline
- [x] Bullhorn REST API integration (search, create contact, add note)
- [x] Push contacts to Bullhorn
- [x] Add notes to Bullhorn
- [x] Neon PostgreSQL database
- [x] Bullhorn company check during pipeline (vacancies, placements, notes, negative signals)

### High Priority (Next)
- [ ] Bullhorn 60-day gate — auto-discard companies with recent meaningful activity
- [ ] ZoomInfo contact enrichment integrated into app (search + double-pass enrich)
- [ ] One-click outreach actions per step (open LinkedIn/email/phone with context)
- [ ] Message template generation per step (Claude-powered, tone-aware)
- [ ] End-of-day batch sync button
- [ ] Activity log (what you did today, timestamped)

### Medium Priority
- [ ] Morning priority dashboard (who's next, what's due)
- [ ] Prospects sorting and pagination
- [ ] Outreach playbook PDF export per company
- [ ] Tracker status per company (Negotiating, Not interested, Placed)

### Low Priority
- [ ] ICP testing/preview before running pipeline
- [ ] History drill-down and filtering
- [ ] Two-way Bullhorn sync (pull updates back)
- [ ] Multiple ICP profiles

---

## Tools & Integrations

| Tool | Purpose | Status |
|------|---------|--------|
| Claude API | Web research, hiring signals, message generation | Active |
| Bullhorn REST API | CRM — contacts, notes, company check | Active (manual token) |
| ZoomInfo MCP | Contact search + enrichment | Available — not yet in app |
| Indeed MCP | Job listings search | Available — not yet in app |
| Greenhouse/Lever APIs | ATS detection | Active |
| Neon PostgreSQL | App database | Active |

---

## Key Files

| File | Purpose |
|------|---------|
| `services/bullhorn.js` | Bullhorn REST API service (dual auth) |
| `services/research.js` | Pipeline orchestrator (Claude + ATS + Bullhorn) |
| `services/claude.js` | Claude web search for hiring signals |
| `services/ats.js` | ATS platform detection |
| `routes/bullhorn.js` | Bullhorn API endpoints |
| `routes/tracker.js` | Tracker CRUD endpoints |
| `routes/pipeline.js` | Pipeline runner + progress streaming |
| `public/js/tracker.js` | Tracker UI with Bullhorn sync |
| `db/schema.sql` | Database schema |
