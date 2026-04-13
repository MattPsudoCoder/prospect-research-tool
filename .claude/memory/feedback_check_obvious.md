---
name: Check the obvious before proceeding
description: Always check existing infrastructure, deployments, credentials, and services before proposing new ones
type: feedback
---

Before proposing ANY new service, tool, account, or infrastructure: check what already exists first.

**Why:** Wasted significant time setting up Neon (redundant — Railway Postgres existed), Render (redundant — Railway existed), and flagging API key costs (redundant — key was already in Railway env vars). All because the existing deployment was never checked.

**How to apply:**
1. Before suggesting a new database: check if one exists (Railway, existing .env, deployed services)
2. Before suggesting a new hosting platform: check if the app is already deployed somewhere
3. Before flagging missing credentials: check deployed env vars
4. Before any infrastructure work: run `git remote -v`, check for deployment configs, check the live URL
5. Do this AUTOMATICALLY — don't wait to be asked
