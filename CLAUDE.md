# Vertz Framework

## Git Identity

All git and GitHub operations MUST use bot tokens. Never commit, push, or create PRs with a personal account.

- **Commits/push:** `doppler run -- bash /app/backstage/.github-bots/git-as.sh <bot-name> <git-command...>`
- **GitHub CLI:** `doppler run -- bash /app/backstage/.github-bots/gh-as.sh <bot-name> <gh-command...>`

Available bots: mike (tech-lead), ben (dev-core), ava (dev-dx), nora (dev-front), josh (advocate), deploy

## Team & Roles

See `/app/backstage/team.json` for the full team structure and role ownership. Use the appropriate bot for the work being done — ben for core packages, nora for frontend/UI, ava for CLI/testing, etc.

## Secrets

All secrets are in Doppler (project: `vertz`, config: `dev`). Never store secrets on disk. Always use `doppler run` to inject them.
