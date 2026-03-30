/**
 * Cloudflare Deployment Types
 *
 * Type definitions for the Cloudflare Workers build pipeline
 * and deployment manifest.
 */

export interface DeploymentManifest {
  version: 1;
  target: 'cloudflare';
  generatedAt: string;
  entities: EntityManifestEntry[];
  routes: RouteManifestEntry[];
  bindings: BindingManifestEntry[];
  assets: {
    hasClient: boolean;
    clientDir?: string;
  };
  ssr: {
    enabled: boolean;
    module?: string;
  };
}

export interface EntityManifestEntry {
  name: string;
  table: string;
  tenantScoped: boolean;
  operations: string[];
  accessRules: Record<string, { type: string }>;
}

export interface RouteManifestEntry {
  method: string;
  path: string;
  entity: string;
  operation: string;
}

export interface BindingManifestEntry {
  type: 'd1' | 'kv' | 'r2' | 'service';
  name: string;
  purpose: string;
}
