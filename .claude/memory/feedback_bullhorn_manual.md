---
name: Bullhorn is manual only — no API
description: Bullhorn CLIENT_SECRET will never be available. All Bullhorn checking is manual. API code fully removed 2026-04-06.
type: feedback
---

Bullhorn integration was fully removed from the codebase on 2026-04-06 per Matthew's instruction — the CLIENT_SECRET will never be available. All Bullhorn columns, UI badges, and the bullhorn.js service file have been deleted.

Matthew checks Bullhorn manually via Chrome when evaluating prospects.

**Why:** The CLIENT_SECRET was never going to come through. Dead code was adding noise (every card showed "In Bullhorn: No" implying a check ran when it didn't).

**How to apply:** Don't suggest Bullhorn API integration. If Matthew asks about Bullhorn, it's a manual Chrome-based workflow.
