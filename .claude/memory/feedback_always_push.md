---
name: Always push changes
description: Always git push after committing — don't ask, just do it
type: feedback
---

Always push changes to origin after committing. Don't ask for confirmation — just push.

**Why:** Matthew expects changes to auto-deploy via Railway on push to master. Asking wastes time.

**How to apply:** After every commit, immediately `git push origin master`.
