# How to Use This App — Daily Workflow

This is the practical workflow for using the Prospect Research Tool as a recruiter at Signify Technology. Written for Matthew Davie's desk (US tech recruitment: TypeScript, React, Node, Scala, Java, Python, Go, iOS, Android).

---

## WEEKLY RHYTHM

### Monday Morning: Research Session (~1 hour)

**Goal:** Find 20 new companies to add to the tracker.

#### Step 1: Discovery (15 min)
Run the `/research` command in Claude Code, or manually:

1. **Source companies from multiple channels:**
   - ZoomInfo: Search for companies matching ICP (50-1500 emp, US, software)
   - Indeed/Dice MCP: Search for job titles in your niche ("Scala engineer", "React developer")
   - WebSearch: "companies hiring [stack] engineers 2026"
   - LinkedIn: Check who's posting roles in your niche
   - Network/referrals: Companies mentioned in Slack, calls, industry news

2. **Paste company names into the Dashboard** (comma-separated or one per line)
3. **Run the pipeline** — watch the SSE progress bar

#### Step 2: Bullhorn Gate (5 min)
Before going further with results:

1. **Connect Bullhorn** if not already connected:
   - Open Bullhorn in Chrome
   - Open DevTools Console (F12)
   - Run: `copy(JSON.stringify({bhRestToken: localStorage.getItem('BhRestToken'), restUrl: localStorage.getItem('rawRestUrl')}))`
   - Paste the token into the Tracker's Bullhorn connection bar

2. The pipeline auto-gates companies with active engagement (jobs, placements, meetings, calls in last 60 days). Check the "gated" count in results.

#### Step 3: Verify & Score (15 min)
Go to the **Prospects page** (`/prospects`):

1. Filter by **High** signal first
2. For each High company, verify:
   - Does the ATS show real engineering roles? (Click through to career page)
   - Are the roles in your ICP stacks? (React, Scala, Go, Python, etc.)
   - Is the company actually US-based with US engineering?
3. Click **"Track"** on companies that pass verification
4. Repeat for **Medium** signal companies

**Hard rule:** Don't track anything below 2.0 score. Don't track without verifying roles exist.

#### Step 4: Enrich with ZoomInfo (15 min)
For each newly tracked company:

1. Use ZoomInfo `account_research` to get company intel (funding, tech stack, growth)
2. Use ZoomInfo `search_contacts` to find hiring decision makers:
   - CTO (always, at any company size)
   - VP Engineering (at 150-500 emp)
   - Director of Engineering (at 500+ emp)
   - Engineering Managers for specific teams hiring
3. Use ZoomInfo `enrich_contacts` to get email + phone (costs 1 bulk credit each)
   - Run enrichment TWICE — ZoomInfo sometimes returns phone on second pass
4. **Filter contacts:** US-based only. Reject +91 (India), +972 (Israel), +44 (UK), etc.

#### Step 5: Add Contacts to Tracker (10 min)
For each company on the Tracker page:

1. Click the company card to expand
2. Add each contact: name, title, LinkedIn URL, email, phone
3. Contacts auto-push to Bullhorn on add (if connected)
4. If Bullhorn isn't connected, use "Backfill Bullhorn" later

**Rule:** Add ALL relevant decision makers, not just 2-3. Every VP, Director, and CTO who could be a hiring authority.

---

### Daily: Outreach Execution (~30 min)

#### Morning Routine

1. **Open the Tracker page** (`/tracker`)
2. **Filter by outreach step** to see who needs what today
3. **Check Bullhorn connection** (re-grab token if expired)

#### Working Through Outreach Steps

**Step 0 → Step 1: LinkedIn Connection**
- View the outreach template (click "View Template" on contact)
- Send personalized LinkedIn connection request
- Click "Advance Step" → select "BD Message" as Bullhorn action
- Add brief note about what you sent

**Step 1 → Step 2: Intro or InMail**
- If they accepted: Send intro message (template 2a)
- If not accepted: Send InMail (template 2b)
- Advance step, log the activity

**Step 2 → Step 3: Spec-In Email**
- Use the generated spec-in template (includes hypothetical candidate)
- Customize with a real candidate if you have one
- Send via email
- Advance step → "Reverse Market" action type

**Step 3 → Step 4: Cold Call**
- Use the call script template
- If no answer: leave voicemail, send SMS follow-up
- Advance step → "Attempted BD Call" action type

**Step 4 → Step 5: Value-Add Email**
- Send market insight or relevant content
- Advance step

**Step 5 → Step 6: LinkedIn Follow-Up**
- Final touchpoint
- Advance step

#### End of Day

1. Click **"Sync Day"** button on the Tracker page
2. This pushes all today's logged activities to Bullhorn as Notes with correct action types
3. Verify sync count matches your activity count

---

### Weekly: Data Hygiene (Friday, 15 min)

1. **Review Low-signal companies:**
   - Have any improved? (New funding, new roles?) → Re-research and upgrade
   - Still dead? → Consider deleting to keep tracker clean

2. **Check for stale contacts:**
   - Anyone who hasn't responded after Step 6? → Mark as cold, move on
   - Job title changes? → Update in tracker

3. **Pipeline history cleanup:**
   - Go to History page (`/history`)
   - Delete old runs you don't need
   - Use "Cleanup Errors" on Prospects page to remove error rows

4. **ICP review:**
   - Go to ICP Settings (`/icp`)
   - Update if your target stacks or company sizes have shifted

---

## KEY INTEGRATIONS & HOW THEY CONNECT

```
Discovery Sources                    Research & Scoring              Tracking & Outreach
─────────────────                    ──────────────────              ───────────────────
                                                                    
ZoomInfo search ──┐                  ┌─ Greenhouse API               Tracker (companies)
Indeed MCP ───────┤                  │  (role scraping)              ├── Contacts (US-only)
Dice MCP ─────────┤  → Dashboard →  ├─ Lever API                    │   ├── Outreach templates
WebSearch ────────┤     Pipeline     │  (role scraping)              │   ├── Activity log
Manual input ─────┘                  ├─ Claude API ──→ Scoring ──→   │   └── Bullhorn sync
                                     │  (signals)     (5 dims)      │
                                     ├─ Bullhorn                    └── Sync Day → Bullhorn
                                     │  (60-day gate)                       Notes
                                     └─ ZoomInfo
                                        (enrichment)
```

---

## TIPS & GOTCHAS

### Do's
- **Enrich before pushing.** Get email/phone/LinkedIn BEFORE adding contacts to tracker. Don't create empty contacts and backfill.
- **Score before tracking.** The scoring system exists for a reason. Don't manually override signals.
- **Use two ZoomInfo passes** for phone numbers. First pass often returns email only.
- **Check Bullhorn first.** The 60-day gate catches most conflicts, but manually verify edge cases.
- **Update the tracker** when you learn new info (e.g., company raised funding, new CTO hired).

### Don'ts
- **Don't cap contacts at 2-3.** Add every relevant US-based decision maker.
- **Don't skip ATS checks.** A company with "High" signal but 0 visible roles is useless.
- **Don't push non-US contacts.** The server will reject them, but filter upstream to save time.
- **Don't track below 2.0 score.** These companies waste your outreach time.
- **Don't say "verified" unless you actually opened the career page.** This has burned us before.

### Bullhorn Token
- Expires after ~60 minutes
- To refresh: Open Bullhorn in Chrome → F12 → Console → grab BhRestToken + rawRestUrl
- POST to `/api/bullhorn/token` with `{bhRestToken, restUrl}`
- The status bar on the Tracker page shows connection state and token age

### ZoomInfo Credits
- **Searches are free** (search_contacts, search_companies)
- **Enrichment costs 1 bulk credit per contact** (enrich_contacts)
- **Company enrichment** also costs credits (enrich_companies)
- ~815 credits remaining as of April 2026
- Always check credit count before bulk enrichment runs

---

## APP URLS

| Page | URL | When to Use |
|------|-----|-------------|
| Dashboard | `/` | Starting new research runs |
| Prospects | `/prospects` | Reviewing pipeline results, adding to tracker |
| Tracker | `/tracker` | Daily outreach, contact management, Bullhorn sync |
| ICP Settings | `/icp` | Updating target criteria |
| History | `/history` | Reviewing past runs, exporting data |
