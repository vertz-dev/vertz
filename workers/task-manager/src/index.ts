/**
 * Vertz Task Manager - GitHub Projects Board Viewer
 * 
 * Cloudflare Worker that displays GitHub Projects board #2 (Vertz Roadmap)
 * Shows issue status, assignees, priority labels, and PR links
 */

export interface Env {
  // GitHub token from Cloudflare secrets
  GITHUB_TOKEN: string;
  GITHUB_ORG: string;
  PROJECT_NUMBER: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  assignees: { login: string; avatarUrl: string }[];
  labels: { name: string; color: string }[];
  pullRequest?: {
    url: string;
    state: string;
  };
}

interface ProjectColumn {
  name: string;
  issues: GitHubIssue[];
}

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

interface GitHubGraphQLResponse {
  data?: {
    organization?: {
      projectV2?: ProjectData;
    };
  };
  errors?: { message: string }[];
}

interface ProjectData {
  title: string;
  items: {
    nodes: ProjectItem[];
  };
}

interface ProjectItem {
  id: string;
  fieldValues: {
    nodes: FieldValue[];
  };
  content: IssueContent | null;
}

interface FieldValue {
  name?: string;
  field?: { name: string };
  pullRequest?: {
    title: string;
    url: string;
    state: string;
  };
}

interface IssueContent {
  number: number;
  title: string;
  state: string;
  url: string;
  assignees: {
    nodes: { login: string; avatarUrl: string }[];
  };
  labels: {
    nodes: { name: string; color: string }[];
  };
  timelineItems?: {
    nodes: { url?: string; state?: string }[];
  };
}

/**
 * Fetch project data from GitHub GraphQL API
 */
async function fetchProjectData(env: Env): Promise<ProjectColumn[]> {
  const query = `
    query($org: String!, $projectNumber: Int!) {
      organization(login: $org) {
        projectV2(number: $projectNumber) {
          title
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                name
                options {
                  name
                  color
                }
              }
            }
          }
          items(first: 100) {
            nodes {
              id
              fieldValues(first: 8) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldPullRequestValue {
                    pullRequest {
                      title
                      url
                      state
                    }
                    field {
                      ... on ProjectV2Field {
                        name
                      }
                    }
                  }
                }
              }
              content {
                ... on Issue {
                  number
                  title
                  state
                  url
                  assignees(first: 10) {
                    nodes {
                      login
                      avatarUrl
                    }
                  }
                  labels(first: 10) {
                    nodes {
                      name
                      color
                    }
                  }
                  timelineItems(first: 1, itemTypes: [PullRequestNode]) {
                    nodes {
                      ... on PullRequest {
                        url
                        state
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        org: env.GITHUB_ORG || "vertz-dev",
        projectNumber: parseInt(env.PROJECT_NUMBER || "2", 10),
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as GitHubGraphQLResponse;

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  const project = data?.data?.organization?.projectV2;
  if (!project) {
    throw new Error("Project not found or access denied");
  }

  // Group items by status column
  const columns: Map<string, GitHubIssue[]> = new Map();
  
  for (const item of project.items.nodes) {
    const content = item.content;
    if (!content) continue;

    // Find the status field value
    let status = "No Status";
    for (const fieldValue of item.fieldValues.nodes) {
      if (fieldValue?.field?.name === "Status" && fieldValue?.name) {
        status = fieldValue.name;
        break;
      }
    }

    // Get PR link from field or timeline
    let pullRequest: { url: string; state: string } | undefined;
    
    // Check direct PR field
    for (const fieldValue of item.fieldValues.nodes) {
      if (fieldValue?.pullRequest) {
        pullRequest = {
          url: fieldValue.pullRequest.url,
          state: fieldValue.pullRequest.state,
        };
        break;
      }
    }
    
    // Fallback: check timeline for PR
    if (!pullRequest && content.timelineItems?.nodes?.[0]) {
      const pr = content.timelineItems.nodes[0];
      if (pr?.url) {
        pullRequest = {
          url: pr.url,
          state: pr.state || "OPEN",
        };
      }
    }

    const issue: GitHubIssue = {
      number: content.number,
      title: content.title,
      state: content.state,
      url: content.url,
      assignees: content.assignees?.nodes || [],
      labels: content.labels?.nodes || [],
      pullRequest,
    };

    const existing = columns.get(status) || [];
    existing.push(issue);
    columns.set(status, existing);
  }

  // Convert to array and sort columns
  const columnOrder = ["Backlog", "To Do", "In Progress", "In Review", "Done", "No Status"];
  const result: ProjectColumn[] = [];
  
  for (const colName of columnOrder) {
    if (columns.has(colName)) {
      result.push({ name: colName, issues: columns.get(colName)! });
    }
  }
  
  // Add any remaining columns
  for (const [name, issues] of columns) {
    if (!columnOrder.includes(name)) {
      result.push({ name, issues });
    }
  }

  return result;
}

/**
 * Generate HTML for the dashboard
 */
function generateHTML(columns: ProjectColumn[], projectTitle: string): string {
  const statusColors: Record<string, string> = {
    "Backlog": "#6e7681",
    "To Do": "#8250df",
    "In Progress": "#bf8700",
    "In Review": "#1f6feb",
    "Done": "#1a7f37",
    "No Status": "#6e7681",
  };

  const stateColors: Record<string, string> = {
    OPEN: "#1a7f37",
    CLOSED: "#8250df",
    MERGED: "#8250df",
  };

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectTitle} - Vertz Task Manager</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
    }
    .header {
      background: #161b22;
      padding: 20px 30px;
      border-bottom: 1px solid #30363d;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { color: #f0f6fc; font-size: 24px; }
    .header .meta { color: #8b949e; font-size: 14px; }
    .container {
      padding: 20px;
      display: flex;
      gap: 20px;
      overflow-x: auto;
    }
    .column {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      min-width: 320px;
      max-width: 320px;
      flex-shrink: 0;
    }
    .column-header {
      padding: 12px 16px;
      border-bottom: 1px solid #30363d;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .column-header h2 {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      color: #f0f6fc;
    }
    .column-count {
      background: #30363d;
      color: #c9d1d9;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
    }
    .column-issues { padding: 12px; }
    .issue {
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .issue:last-child { margin-bottom: 0; }
    .issue-title {
      font-size: 14px;
      color: #c9d1d9;
      text-decoration: none;
      display: block;
      margin-bottom: 8px;
    }
    .issue-title:hover { color: #58a6ff; }
    .issue-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .issue-number {
      color: #8b949e;
      font-size: 12px;
    }
    .label {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    .assignee {
      width: 20px;
      height: 20px;
      border-radius: 50%;
    }
    .pr-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #58a6ff;
      text-decoration: none;
      font-size: 12px;
    }
    .pr-link:hover { text-decoration: underline; }
    .pr-state {
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .pr-state.open { background: #1a7f37; color: #fff; }
    .pr-state.merged { background: #8250df; color: #fff; }
    .pr-state.closed { background: #da3633; color: #fff; }
    .empty-state {
      text-align: center;
      padding: 30px;
      color: #8b949e;
    }
    .error {
      background: #da3633;
      color: #fff;
      padding: 20px;
      margin: 20px;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${projectTitle}</h1>
    <div class="meta">Vertz Roadmap - GitHub Project Board</div>
  </div>
  <div class="container">`;

  for (const column of columns) {
    const color = statusColors[column.name] || "#6e7681";
    html += `
    <div class="column">
      <div class="column-header">
        <h2 style="color: ${color}">${column.name}</h2>
        <span class="column-count">${column.issues.length}</span>
      </div>
      <div class="column-issues">`;
    
    if (column.issues.length === 0) {
      html += `<div class="empty-state">No issues</div>`;
    } else {
      for (const issue of column.issues) {
        html += `
        <div class="issue">
          <a href="${issue.url}" target="_blank" class="issue-title">#${issue.number} ${issue.title}</a>
          <div class="issue-meta">
            <span class="issue-number">${issue.state}</span>`;
        
        for (const label of issue.labels) {
          const textColor = parseInt(label.color, 16) > 0x7FFF ? "#000" : "#fff";
          html += `<span class="label" style="background: #${label.color}; color: ${textColor}">${label.name}</span>`;
        }
        
        for (const assignee of issue.assignees) {
          html += `<img src="${assignee.avatarUrl}" alt="${assignee.login}" class="assignee" title="${assignee.login}">`;
        }
        
        if (issue.pullRequest) {
          const prState = issue.pullRequest.state?.toLowerCase() || "open";
          html += `<a href="${issue.pullRequest.url}" target="_blank" class="pr-link">
            PR <span class="pr-state ${prState}">${prState}</span>
          </a>`;
        }
        
        html += `</div></div>`;
      }
    }
    
    html += `</div></div>`;
  }

  html += `</div></body></html>`;

  return html;
}

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Enable CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Check if GitHub token is configured
      if (!env.GITHUB_TOKEN) {
        return new Response(generateHTML([], "Configuration Error"), {
          headers: { "Content-Type": "text/html", ...corsHeaders },
        });
      }

      // Fetch project data
      const columns = await fetchProjectData(env);

      // Generate and return HTML
      const html = generateHTML(columns, "Vertz Roadmap");
      
      return new Response(html, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Vertz Task Manager</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
    .error { background: #da3633; color: #fff; padding: 20px; border-radius: 6px; max-width: 600px; margin: 50px auto; }
    h1 { margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="error">
    <h1>Failed to load project</h1>
    <p>${message}</p>
    <p style="margin-top: 10px; font-size: 12px; opacity: 0.8;">Make sure GITHUB_TOKEN is configured with proper project permissions.</p>
  </div>
</body>
</html>`;

      return new Response(errorHtml, {
        status: 500,
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }
  },
};
