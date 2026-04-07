export interface SandboxConfig {
  readonly repo: string;
  readonly branch?: string;
}

export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface SearchMatch {
  readonly file: string;
  readonly line: number;
  readonly content: string;
}

export interface SandboxClient {
  exec(command: string, opts?: { workDir?: string; timeout?: number }): Promise<ExecResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  searchFiles(pattern: string, path?: string): Promise<SearchMatch[]>;
  listFiles(path: string): Promise<string[]>;
  destroy(): Promise<void>;
}

export interface DaytonaSandbox {
  process: {
    executeCommand(
      command: string,
      workDir?: string,
      envVars?: Record<string, string>,
      timeout?: number,
    ): Promise<{ result: string; exitCode: number }>;
  };
  fs: {
    downloadFile(path: string, timeout?: number): Promise<Buffer>;
    uploadFile(content: Buffer | string, destination: string, timeout?: number): Promise<void>;
    findFiles(path: string, pattern: string): Promise<SearchMatch[]>;
    listFiles(path: string): Promise<Array<{ name: string }>>;
  };
  delete(timeout?: number): Promise<void>;
}

const WORK_DIR = '/home/daytona/workspace';

export function wrapSandbox(sandbox: DaytonaSandbox): SandboxClient {
  return {
    async exec(command, opts) {
      const result = await sandbox.process.executeCommand(
        command,
        opts?.workDir ?? WORK_DIR,
        undefined,
        opts?.timeout,
      );
      return {
        stdout: result.result,
        stderr: '',
        exitCode: result.exitCode,
      };
    },

    async readFile(path) {
      const content = await sandbox.fs.downloadFile(path);
      return content.toString();
    },

    async writeFile(path, content) {
      await sandbox.fs.uploadFile(Buffer.from(content), path);
    },

    async searchFiles(pattern, path) {
      const matches = await sandbox.fs.findFiles(path ?? WORK_DIR, pattern);
      return matches.map((m) => ({
        file: m.file,
        line: m.line,
        content: m.content,
      }));
    },

    async listFiles(path) {
      const files = await sandbox.fs.listFiles(path);
      return files.map((f) => f.name);
    },

    async destroy() {
      await sandbox.delete();
    },
  };
}
