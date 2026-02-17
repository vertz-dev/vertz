# Vertz Task Manager

Cloudflare Worker that displays GitHub Projects board #2 (Vertz Roadmap) as a read-only dashboard.

## Features

- Displays GitHub Projects board #2 (Vertz Roadmap)
- Shows issue status, assignees, priority labels, and PR links
- Read-only dashboard (no write operations)
- Dark theme optimized for quick inspection

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Set the GitHub token as a Cloudflare secret:
   ```bash
   wrangler secret put GITHUB_TOKEN
   ```
   
   The token needs the following permissions:
   - `read:org` - Read organization data
   - `repo` - Read repository data
   
   **Note:** The token must have access to organization projects. If you encounter "Project not found" errors, ensure the token has been granted access to the vertz-dev organization's projects.

## Development

Run the worker locally:
```bash
bun run dev
```

## Deployment

Deploy to Cloudflare Workers:
```bash
bun run deploy
```

The worker will be available at `https://vertz-task-manager.<your-account>.workers.dev`

## Configuration

Environment variables (configured in wrangler.toml or as secrets):

- `GITHUB_ORG` - GitHub organization name (default: "vertz-dev")
- `GITHUB_TOKEN` - GitHub Personal Access Token with project read permissions
- `PROJECT_NUMBER` - GitHub Projects board number (default: "2")

## GitHub Token Permissions

To access GitHub Projects, the token needs specific permissions:

1. **Option A: Use a user's PAT**
   - Generate a Personal Access Token at https://github.com/settings/tokens
   - Select `read:org` and `repo` scopes
   - Ensure the user has access to vertz-dev organization projects

2. **Option B: Add bot to organization**
   - Add `vertz-tech-lead[bot]` as a member of vertz-dev organization
   - Grant it access to organization projects

## Preview on PRs

To enable preview deployments on PRs that touch this worker, configure Cloudflare Pages or use Wrangler's preview functionality:

```bash
bunx wrangler deploy --env preview
```
