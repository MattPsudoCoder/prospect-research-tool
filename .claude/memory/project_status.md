---
name: Project status as of 2026-04-08
description: ProspectResearch app — all core features live, API key restored, tracker UI fixed
type: project
---

- App live at prospect-research-tool-production.up.railway.app
- Railway env vars: DATABASE_URL, ANTHROPIC_API_KEY (new key "prospect-research-railway" created 2026-04-08)
- Old Anthropic key "prospect-research-tool" (sk-ant-api03-C68...rwAA) still exists but is unused — can be deleted
- `/api/features` returns `claude_api: true` — Claude research, script generation, discovery all enabled
- 25 tracked companies with 89+ contacts in tracker
- Tracker cards now show: hiring signals, keyword tags, proper ATS display
- Step dropdown UI fixed — compact dropdown with visible step tips
- "Generate Scripts" buttons visible on all contacts
- Bullhorn connection still manual paste (bookmarklet CORS unsolved)
- Neon DB was set up redundantly — Railway Postgres is the real DB
- ZoomInfo MCP connected but not integrated into pipeline yet
- Railway trial: ~9 days / $4.15 remaining, then $5/month

**Why:** All session handover items 1-4 are resolved. App is functional for daily use.

**How to apply:** Remaining work from handover: backfill hiring signals for discovery-run companies, run fresh discovery batch, fix Bullhorn UX, explore Ollama for free script gen, build portals system.
