---
name: Use Bullhorn REST API not UI automation
description: Always use the Bullhorn REST API (via browser localStorage token) instead of Chrome UI clicking for all Bullhorn operations
type: feedback
---

Always use the Bullhorn REST API for all Bullhorn operations — never click through the UI manually.

**Why:** The REST API is dramatically faster for bulk operations (52 contacts checked + 22 notes + 9 new contacts in seconds vs hours of UI clicking). The BhRestToken and restUrl are available in localStorage from the authenticated browser session.

**How to apply:** When doing any Bullhorn work (searching contacts, adding contacts, adding notes, checking placements, etc.), use JavaScript execution in the browser to call the REST API directly. Only fall back to UI automation if the API fails or for operations that aren't supported by the API.
