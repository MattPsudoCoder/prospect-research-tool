# Session Handover — April 8, 2026 (Afternoon/Evening Session)

## Who Is Matthew
Matthew Davie — senior technical recruiter at Signify Technology, 10+ years, places software engineers (TypeScript, Scala, Node.js, mobile, Go, Rust) at US tech companies. Based in Austin, TX. Uses Bullhorn CRM daily. Building a prospect research web app to streamline his BD workflow.

## The App
- **Repo:** `MattPsudoCoder/prospect-research-tool` on GitHub, `master` branch
- **Live:** https://prospect-research-tool-production.up.railway.app
- **Stack:** Node.js + Express, PostgreSQL on Railway, vanilla JS frontend
- **Auto-deploys** on push to `master`

---

## What We Built/Fixed Today

### 1. Tracker UI Fixes (Pushed + Live)
- **View Scripts** — now shows ALL 9 outreach template steps in one panel (was only showing current step). Current step highlighted with blue "CURRENT" badge.
- **Contact display** — email and phone shown as visible text, not hidden behind icon tooltips.
- **Template format bug** — outreach service stores email templates as `{subject, body}` objects. Frontend was calling `.match()` on objects and crashing. Added `templateText()` and `extractEmailParts()` helpers to handle both object and string formats.

### 2. One-Click Outreach Actions (Pushed + Live)
- **Step action buttons** on each contact card: Open LinkedIn, Compose Email (pre-filled subject+body via mailto), Call (with phone number displayed).
- **Action buttons in template viewer** — each template card has Open LinkedIn / Compose Email / Call button plus a "Done" button.
- **Done button** — advances to next step + logs activity with correct Bullhorn action type.
- **Separate window** — LinkedIn/email buttons open in a new Chrome window (`popup=yes`) instead of a tab. Uses named window `prospect_outreach` so subsequent clicks reuse it. NOTE: May still open as tab on some Chrome configs — user reported it wasn't working perfectly.

### 3. Bullhorn Activity Mapping (Pushed + Live)
Each outreach step maps to a Bullhorn note action type:

| Step | Channel | BH Action Type |
|------|---------|---------------|
| 1. Connection request | LinkedIn | BD Message |
| 2a. Intro (accepted) | LinkedIn | BD Message |
| 2b. Intro (not accepted) | LinkedIn | BD Message |
| 3. Spec-in email | Email | Reverse Market |
| 4. Cold call | Phone | Attempted BD Call |
| 5. Value-add email | Email | Reverse Market |
| 6. LinkedIn follow-up | LinkedIn | Reverse Market |

This is stored in the `STEPS` array in `public/js/tracker.js` as the `bhAction` property. The `bh_action` field is passed to the backend on step changes and stored in the `activity_log.action` column.

### 4. Bullhorn Connection via Claude in Chrome (Working)
- **No manual token pasting.** Claude Code grabs `BhRestToken` and `rawRestUrl` from Bullhorn's localStorage via Claude in Chrome MCP, then POSTs to `/api/bullhorn/token`.
- **Flow:** User says "connect Bullhorn" → Claude opens Chrome tab to `app.bullhornstaffing.com` → extracts tokens → POSTs to app → connected.
- **Token TTL** extended from 8 min to 60 min in `services/bullhorn.js`. Actual expiry caught by 401 handler.
- **User must have Bullhorn open in Chrome** for this to work. The Chrome tab stays at `app.bullhornstaffing.com`.

### 5. Auto-Push Contacts to Bullhorn (Pushed + Live)
- Contacts now auto-push to BH when added to the tracker (if BH is connected). Searches first to link existing records, creates if new.
- **Backfill endpoint:** `POST /api/tracker/backfill-bullhorn` — pushes all contacts missing `bullhorn_id`. Already run; all current contacts have BH IDs.
- Contacts should exist in BH BEFORE outreach begins, not after.

### 6. End-of-Day Bullhorn Sync (Working — Tested Today)
- **Sync Day button** in tracker UI calls `POST /api/bullhorn/sync-day`
- Queries `activity_log` for unsynced activities where contact has `bullhorn_id`
- Pushes each as a Bullhorn Note with the correct action type
- **Tested today:** 66 notes synced successfully. Verified via Bullhorn REST API — all notes landed.
- **Note format fix:** removed double `[BD Message] [BD Message]` wrapping. Now: Action = "BD Message", Comment = "1. Connection request — LinkedIn"

### 7. Batch Script Generation (Pushed + Live)
- **"Generate All Scripts" button** on company cards — generates outreach templates for ONE contact (1 API call), then clones to all other contacts at that company, swapping name and title.
- Uses `cloneTemplates()` in `services/outreach.js` — regex find-replace on full name, first name, and title.
- Saves N-1 API calls per company.

### 8. ZoomInfo Contact Enrichment (Done — 76 contacts)
- ZoomInfo is an **MCP tool** — NO API keys needed. Tools: `search_contacts`, `enrich_contacts`, `search_companies`, `find_similar_companies`, `lookup`.
- **Lookup values:** Department = job function `6.19` (Engineering & Technical) + `0.6` (Engineering & Technical Executive). Management levels = "VP Level Exec", "Director", "Manager", "C Level Exec".
- **Always do TWO enrichment passes** for phone numbers (ZoomInfo sometimes returns phones on second pass).
- **Enriched contacts across 13 tracked companies** — all with verified business emails, phone numbers, LinkedIn profiles.
- Claude Code runs the enrichment, then pushes contacts to the app via `POST /api/tracker/:companyId/contacts`.

### 9. Prospect Call List PDF (Generated)
- **File:** `Research Pbs/Prospect_Call_List_2026-04-08.pdf`
- 20 Bullhorn-clear companies with engineering leadership contacts
- Generated via `reportlab` Python script at `Research Pbs/generate_calllist.py`
- Companies found via ZoomInfo `search_companies` (recently funded + similar companies) then checked against Bullhorn for 60-day conflicts.
- Most well-known tech companies are already in Signify's CRM as prospects — need to search for smaller/newer companies to find clean leads.

### 10. Timezone Fix (Pushed + Live)
- All dates in the app display in Central Time (Austin) via `Intl.DateTimeFormat` with `timeZone: 'America/Chicago'`
- Utility file: `public/js/timezone-utils.js` with `formatCentralDate()`, `formatCentralDateTime()`, `getCentralDateISO()`
- Applied to prospects page and history page. Tracker and dashboard don't render dates.

### 11. Activity Log Cleanup
- Added `DELETE /api/tracker/activity/batch` endpoint for cleaning test/noise entries
- Cleaned 29 test entries today (step-cycling, "Not started" resets, duplicates)

---

## Current State of the App

### What Works End-to-End
1. **Research pipeline** — Run Pipeline with manual companies or Claude ICP search → Tier 1 (Greenhouse/Lever) → Tier 2 (Claude web search + Bullhorn check) → Tier 3 (Claude ATS fallback) → scoring → results on Prospects page
2. **Prospect → Tracker** — Click "Track" on a prospect → moves to Tracker
3. **ZoomInfo enrichment** — Claude Code searches ZoomInfo MCP for engineering leadership → pushes contacts to tracker via API
4. **Outreach workflow** — View Scripts, one-click actions, step advancement with activity logging
5. **Bullhorn sync** — Claude Code connects BH → activities sync as notes with correct action types
6. **Script generation** — Individual (per contact) or batch (per company, 1 API call)

### Database Tables (Railway PostgreSQL)
- `icp_settings` — ICP criteria
- `pipeline_runs` — run history
- `companies` — researched companies with scores
- `tracked_companies` — companies on the tracker
- `tracked_contacts` — contacts with outreach_templates (JSONB), outreach_step, bullhorn_id
- `activity_log` — timestamped actions with synced_to_bullhorn flag

### Key Files
| File | What It Does |
|------|-------------|
| `services/bullhorn.js` | BH REST API (manual token, 60min TTL) |
| `services/outreach.js` | Claude-powered script generation + `cloneTemplates()` |
| `services/research.js` | Multi-tier pipeline orchestrator |
| `services/scoring.js` | 5-dimension prospect scoring |
| `services/ats.js` | Greenhouse + Lever API checks |
| `services/claude.js` | Claude web search for hiring signals |
| `routes/tracker.js` | Tracker CRUD, outreach generation, activity log, backfill-bullhorn |
| `routes/bullhorn.js` | BH connection, push, sync-day, company check |
| `routes/pipeline.js` | Pipeline runner with SSE progress |
| `public/js/tracker.js` | Tracker UI — STEPS array with bhAction mapping, one-click actions, template viewer |
| `public/js/timezone-utils.js` | Central Time formatting |

---

## What's Left To Do

### High Priority
1. **Window.open not working as separate window** — Chrome may be blocking the popup. The `popup=yes` approach was deployed but user reported it still opens as a tab. May need a different approach or popup permission.
2. **Activity auto-logging on action button click** — Currently clicking "Open LinkedIn" or "Compose Email" does NOT log activity. Only "Done" button or step dropdown logs. The action buttons should auto-log when clicked.
3. **Prospect call list — more contacts per company** — The PDF has mostly 1 contact per company. Need a second pass with wider ZoomInfo criteria (include Staff/Principal engineers, Heads of Product, Founders at smaller companies).
4. **Note format cleanup** — The 66 notes pushed today have mixed formats: 10 say "BD Message" action, 56 say "1. Connection request" action (logged before mapping code deployed). Future syncs will be clean. Could retroactively update the old ones via BH API but low priority.

### Medium Priority
5. **Morning priority dashboard** — "Who's next, what's due" view. Not built yet.
6. **Outreach playbook PDF per company** — Full playbook like the ones in `BH/Expanding Clients 2/` (company profile, all contacts, CRM context, full cadence). Could auto-generate using tracker data + ZoomInfo.
7. **Ollama integration** — Use Matthew's RTX 3080 Ti (12GB VRAM) for free script generation instead of Claude API. Mentioned in previous session handover but not explored.
8. **Bullhorn token auto-refresh** — Currently user has to say "connect Bullhorn" when token expires. Could build a scheduled check or a proxy approach.
9. **Pipeline auto-enrichment** — When companies are tracked after pipeline research, auto-trigger ZoomInfo contact enrichment. Currently manual (ask Claude Code).

### Low Priority
10. **Two-way Bullhorn sync** — Pull updates from BH back to app
11. **ICP testing/preview** before running pipeline
12. **Tracker status per company** — Negotiating, Not interested, Placed
13. **History drill-down and filtering**

---

## Tone Rules for Outreach Scripts
- Write as Matthew Davie, consultative and strategic
- Never salesy, never generic
- Short sentences, natural rhythm
- NEVER "I hope this finds you well" or "I wanted to reach out"
- NEVER congratulate on promotions
- One specific, relevant detail beats three generic ones
- Spec-in emails need realistic hypothetical candidate profiles
- Reference their specific tech stack, roles, or recent news

---

## Critical Things to Remember
1. **ZoomInfo is an MCP tool** — NO API keys needed. Just call `mcp__752c874e...` tools directly.
2. **Bullhorn uses browser token passthrough** — NO OAuth, NO CLIENT_SECRET. Grab from Chrome localStorage.
3. **Bullhorn 60-day gate** — Companies with meaningful BH notes in last 60 days are auto-discarded. Mailshot-only doesn't count.
4. **Two enrichment passes** for ZoomInfo phone numbers.
5. **Auto-deploy on push to master** — Railway watches the repo.
6. **All times in Central Time** (America/Chicago).
7. **Template format** — outreach templates can be plain strings OR `{subject, body}` objects. Always use `templateText()` to normalise.
8. **The user is direct and moves fast.** Don't ask questions that are answered in handover docs. Don't duplicate work. Read everything first.
