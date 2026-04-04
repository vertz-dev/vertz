// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

export interface PipeConfig {
  secrets?: string[];
  workspace?: WorkspaceConfig;
  tasks: Record<string, TaskDef>;
  workflows?: Record<string, WorkflowConfig>;
  cache?: CacheConfig;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskDef = CommandTask | StepsTask;

interface TaskBase {
  deps?: Dep[];
  cond?: Condition;
  cache?: TaskCacheConfig;
  env?: Record<string, string>;
  timeout?: number;
}

export type CommandTask =
  | (TaskBase & { command: string; steps?: never; scope?: 'package' })
  | (TaskBase & { command: string; steps?: never; scope: 'root'; deps?: RootDep[] });

export type StepsTask =
  | (TaskBase & { steps: string[]; command?: never; scope?: 'package' })
  | (TaskBase & { steps: string[]; command?: never; scope: 'root'; deps?: RootDep[] });

type RootDep = string & { __brand?: 'rootDep' };

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export type Dep = string | DepEdge;

export interface DepEdge {
  task: string;
  on: 'success' | 'always' | 'failure' | ((result: TaskResult) => boolean);
}

// ---------------------------------------------------------------------------
// Task results (passed to callback deps)
// ---------------------------------------------------------------------------

export interface TaskResult {
  status: 'success' | 'failed' | 'skipped';
  exitCode: number | null;
  duration: number;
  package: string | null;
  task: string;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export interface TaskCacheConfig {
  inputs: string[];
  outputs: string[];
}

export interface CacheConfig {
  local?: string;
  remote?: string | false;
  maxSize?: number;
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export interface WorkflowConfig {
  run: string[];
  filter?: WorkflowFilter;
  env?: Record<string, string>;
}

export type WorkflowFilter = 'affected' | 'all' | string[];

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export type Condition =
  | ChangedCondition
  | BranchCondition
  | EnvCondition
  | AllCondition
  | AnyCondition;

export interface ChangedCondition {
  type: 'changed';
  patterns: string[];
}

export interface BranchCondition {
  type: 'branch';
  names: string[];
}

export interface EnvCondition {
  type: 'env';
  name: string;
  value?: string;
}

export interface AllCondition {
  type: 'all';
  conditions: Condition[];
}

export interface AnyCondition {
  type: 'any';
  conditions: Condition[];
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface WorkspaceConfig {
  packages?: string[];
  native?: { root: string; members: string[] };
}
