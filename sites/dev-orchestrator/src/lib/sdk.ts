import type { AgentFullDetail, AgentSummary } from "../api/services/agents";
import type { AgentInfo } from "../api/services/dashboard";
import type { DefinitionDetail, StepSummary } from "../api/services/definitions";
import type { StepRunDetail, WorkflowArtifact, WorkflowRun } from "../api/services/workflows";

type SdkMethod<TBody, TResult> = ((body: TBody) => Promise<TResult>) & {
  readonly url: string;
  readonly method: string;
};

async function requestJson<TResult>(
  path: string,
  init?: RequestInit,
): Promise<TResult> {
  const response = await fetch(path, init);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as TResult;
  }

  return response.json() as Promise<TResult>;
}

function createMethod<TBody, TResult>(
  url: string,
  method: string,
  handler: (body: TBody) => Promise<TResult>,
): SdkMethod<TBody, TResult> {
  return Object.assign(handler, { url, method });
}

export const sdk = {
  dashboard: {
    listAgents: createMethod<void, { agents: AgentInfo[] }>(
      "/api/dashboard/listAgents",
      "GET",
      () => requestJson<{ agents: AgentInfo[] }>("/api/dashboard/listAgents"),
    ),
  },
  workflows: {
    list: createMethod<{ status?: string; page?: number; pageSize?: number } | void, { runs: WorkflowRun[]; total: number; page: number; pageSize: number }>(
      "/api/workflows/list",
      "POST",
      (body) =>
        requestJson<{ runs: WorkflowRun[]; total: number; page: number; pageSize: number }>("/api/workflows/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        }),
    ),
    start: createMethod<{ issueNumber: number; repo: string }, WorkflowRun>(
      "/api/workflows/start",
      "POST",
      (body) =>
        requestJson<WorkflowRun>("/api/workflows/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    ),
    get: createMethod<{ id: string }, WorkflowRun | null>(
      "/api/workflows/get",
      "POST",
      ({ id }) =>
        requestJson<WorkflowRun | null>("/api/workflows/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
    ),
    approve: createMethod<{ id: string }, { approved: boolean }>(
      "/api/workflows/approve",
      "POST",
      ({ id }) =>
        requestJson<{ approved: boolean }>("/api/workflows/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
    ),
    cancel: createMethod<{ id: string }, { cancelled: boolean }>(
      "/api/workflows/cancel",
      "POST",
      ({ id }) =>
        requestJson<{ cancelled: boolean }>("/api/workflows/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
    ),
    retry: createMethod<{ id: string }, WorkflowRun | null>(
      "/api/workflows/retry",
      "POST",
      ({ id }) =>
        requestJson<WorkflowRun | null>("/api/workflows/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
    ),
    stepDetail: createMethod<{ runId: string; step: string }, StepRunDetail | null>(
      "/api/workflows/stepDetail",
      "POST",
      (body) =>
        requestJson<StepRunDetail | null>("/api/workflows/stepDetail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    ),
    artifacts: createMethod<{ runId: string }, { artifacts: WorkflowArtifact[] }>(
      "/api/workflows/artifacts",
      "POST",
      (body) =>
        requestJson<{ artifacts: WorkflowArtifact[] }>("/api/workflows/artifacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    ),
  },
  agents: {
    list: createMethod<void, { agents: AgentSummary[] }>(
      "/api/agents/list",
      "POST",
      () =>
        requestJson<{ agents: AgentSummary[] }>("/api/agents/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{}',
        }),
    ),
    get: createMethod<{ name: string }, AgentFullDetail | null>(
      "/api/agents/get",
      "POST",
      (body) =>
        requestJson<AgentFullDetail | null>("/api/agents/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    ),
    updatePrompt: createMethod<{ name: string; prompt: string }, { success: boolean }>(
      "/api/agents/updatePrompt",
      "POST",
      (body) =>
        requestJson<{ success: boolean }>("/api/agents/updatePrompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    ),
  },
  definitions: {
    list: createMethod<void, { definitions: Array<{ name: string; steps: StepSummary[] }> }>(
      "/api/definitions/list",
      "POST",
      () =>
        requestJson<{ definitions: Array<{ name: string; steps: StepSummary[] }> }>("/api/definitions/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{}',
        }),
    ),
    get: createMethod<{ name: string }, DefinitionDetail | null>(
      "/api/definitions/get",
      "POST",
      (body) =>
        requestJson<DefinitionDetail | null>("/api/definitions/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    ),
  },
};
