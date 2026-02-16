import type { Diagnostic } from '../errors';
export interface SourceLocation {
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
}
export interface AppIR {
  app: AppDefinition;
  env?: EnvIR;
  modules: ModuleIR[];
  middleware: MiddlewareIR[];
  schemas: SchemaIR[];
  dependencyGraph: DependencyGraphIR;
  diagnostics: Diagnostic[];
}
export interface AppDefinition extends SourceLocation {
  basePath: string;
  version?: string;
  globalMiddleware: MiddlewareRef[];
  moduleRegistrations: ModuleRegistration[];
}
export interface ModuleRegistration {
  moduleName: string;
  options?: Record<string, unknown>;
}
export interface EnvIR extends SourceLocation {
  loadFiles: string[];
  schema?: SchemaRef;
  variables: EnvVariableIR[];
}
export interface EnvVariableIR {
  name: string;
  type: string;
  hasDefault: boolean;
  required: boolean;
}
export interface ModuleIR extends SourceLocation {
  name: string;
  imports: ImportRef[];
  options?: SchemaRef;
  services: ServiceIR[];
  routers: RouterIR[];
  exports: string[];
}
export interface ImportRef {
  localName: string;
  sourceModule?: string;
  sourceExport?: string;
  isEnvImport: boolean;
}
export interface ServiceIR extends SourceLocation {
  name: string;
  moduleName: string;
  inject: InjectRef[];
  methods: ServiceMethodIR[];
}
export interface InjectRef {
  localName: string;
  resolvedToken: string;
}
export interface ServiceMethodIR {
  name: string;
  parameters: ServiceMethodParam[];
  returnType: string;
}
export interface ServiceMethodParam {
  name: string;
  type: string;
}
export interface RouterIR extends SourceLocation {
  name: string;
  moduleName: string;
  prefix: string;
  inject: InjectRef[];
  routes: RouteIR[];
}
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
export interface RouteIR extends SourceLocation {
  method: HttpMethod;
  path: string;
  fullPath: string;
  operationId: string;
  params?: SchemaRef;
  query?: SchemaRef;
  body?: SchemaRef;
  headers?: SchemaRef;
  response?: SchemaRef;
  middleware: MiddlewareRef[];
  description?: string;
  tags: string[];
}
export interface MiddlewareIR extends SourceLocation {
  name: string;
  inject: InjectRef[];
  headers?: SchemaRef;
  params?: SchemaRef;
  query?: SchemaRef;
  body?: SchemaRef;
  requires?: SchemaRef;
  provides?: SchemaRef;
}
export interface MiddlewareRef {
  name: string;
  sourceFile: string;
}
export interface SchemaIR extends SourceLocation {
  name: string;
  id?: string;
  moduleName: string;
  namingConvention: SchemaNameParts;
  jsonSchema?: Record<string, unknown>;
  isNamed: boolean;
}
export interface SchemaNameParts {
  operation?: string;
  entity?: string;
  part?: string;
}
export type SchemaRef = NamedSchemaRef | InlineSchemaRef;
export interface NamedSchemaRef {
  kind: 'named';
  schemaName: string;
  sourceFile: string;
  jsonSchema?: Record<string, unknown>;
}
export interface InlineSchemaRef {
  kind: 'inline';
  sourceFile: string;
  jsonSchema?: Record<string, unknown>;
}
export interface ModuleDefContext {
  moduleDefVariables: Map<string, string>;
}
export interface DependencyGraphIR {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  initializationOrder: string[];
  circularDependencies: string[][];
}
export type DependencyNodeKind = 'module' | 'service' | 'router' | 'middleware';
export interface DependencyNode {
  id: string;
  kind: DependencyNodeKind;
  name: string;
  moduleName?: string;
}
export type DependencyEdgeKind = 'imports' | 'inject' | 'uses-middleware' | 'exports';
export interface DependencyEdge {
  from: string;
  to: string;
  kind: DependencyEdgeKind;
}
//# sourceMappingURL=types.d.ts.map
