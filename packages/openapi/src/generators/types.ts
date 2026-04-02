export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateOptions {
  schemas?: boolean;
  baseURL?: string;
}
