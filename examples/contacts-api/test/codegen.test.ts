import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const EXAMPLE_DIR = resolve(import.meta.dir, '..');
const GENERATED_DIR = resolve(EXAMPLE_DIR, 'src/generated');
const OPENAPI_PATH = resolve(EXAMPLE_DIR, '.vertz/generated/openapi.json');

describe('codegen', () => {
  beforeAll(async () => {
    // Clean previous output to ensure a fresh run
    if (existsSync(GENERATED_DIR)) {
      rmSync(GENERATED_DIR, { recursive: true });
    }

    const proc = Bun.spawn(['bun', 'run', 'codegen'], {
      cwd: EXAMPLE_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`codegen failed (exit ${exitCode}): ${stderr}`);
    }
  }, 30_000);

  afterAll(() => {
    // Clean up generated files after tests
    if (existsSync(GENERATED_DIR)) {
      rmSync(GENERATED_DIR, { recursive: true });
    }
  });

  // ---------------------------------------------------------------------------
  // SDK file structure
  // ---------------------------------------------------------------------------

  describe('SDK output', () => {
    it('generates the client factory', () => {
      expect(existsSync(resolve(GENERATED_DIR, 'client.ts'))).toBe(true);
    });

    it('generates package.json with exports', () => {
      expect(existsSync(resolve(GENERATED_DIR, 'package.json'))).toBe(true);
    });

    it('generates README.md', () => {
      expect(existsSync(resolve(GENERATED_DIR, 'README.md'))).toBe(true);
    });

    it('generates entity SDK for contacts', () => {
      expect(existsSync(resolve(GENERATED_DIR, 'entities/contacts.ts'))).toBe(true);
    });

    it('generates entity schema for contacts', () => {
      expect(existsSync(resolve(GENERATED_DIR, 'schemas/contacts.ts'))).toBe(true);
    });

    it('generates entity types for contacts', () => {
      expect(existsSync(resolve(GENERATED_DIR, 'types/contacts.ts'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // SDK content
  // ---------------------------------------------------------------------------

  describe('SDK content', () => {
    it('client.ts exports createClient with contacts entity wired up', async () => {
      const content = await Bun.file(resolve(GENERATED_DIR, 'client.ts')).text();
      expect(content).toContain('export function createClient');
      expect(content).toContain("import { FetchClient } from '@vertz/fetch'");
      expect(content).toContain("import { createContactsSdk } from './entities/contacts'");
      expect(content).toContain('export interface ClientOptions');
      expect(content).toContain('contacts: createContactsSdk(client)');
      expect(content).toContain('export type Client = ReturnType<typeof createClient>');
    });

    it('package.json locks down import paths', async () => {
      const pkg = await Bun.file(resolve(GENERATED_DIR, 'package.json')).json();
      expect(pkg.name).toBe('.vertz-generated');
      expect(pkg.private).toBe(true);
      expect(pkg.exports['.']).toBe('./client.ts');
      expect(pkg.exports['./types']).toBe('./types/index.ts');
    });

    it('README.md documents createClient usage and contacts resource', async () => {
      const content = await Bun.file(resolve(GENERATED_DIR, 'README.md')).text();
      expect(content).toContain('createClient');
      expect(content).toContain('contacts');
    });

    it('entities/contacts.ts exports CRUD methods', async () => {
      const content = await Bun.file(resolve(GENERATED_DIR, 'entities/contacts.ts')).text();
      expect(content).toContain('list');
      expect(content).toContain('get');
      expect(content).toContain('create');
      expect(content).toContain('update');
      expect(content).toContain('delete');
    });

    it('schemas/contacts.ts exports create and update input schemas', async () => {
      const content = await Bun.file(resolve(GENERATED_DIR, 'schemas/contacts.ts')).text();
      expect(content).toContain('createContactsInputSchema');
      expect(content).toContain('updateContactsInputSchema');
    });

    it('types/contacts.ts exports response and input types', async () => {
      const content = await Bun.file(resolve(GENERATED_DIR, 'types/contacts.ts')).text();
      expect(content).toContain('ContactsResponse');
      expect(content).toContain('CreateContactsInput');
      expect(content).toContain('UpdateContactsInput');
    });

    it('response types include all contact fields', async () => {
      const content = await Bun.file(resolve(GENERATED_DIR, 'types/contacts.ts')).text();
      // At least one response type should have all model fields
      expect(content).toContain('id: string');
      expect(content).toContain('name: string');
      expect(content).toContain('createdAt: string');
      expect(content).toContain('updatedAt: string');
    });
  });

  // ---------------------------------------------------------------------------
  // OpenAPI spec
  // ---------------------------------------------------------------------------

  describe('OpenAPI spec', () => {
    it('generates an openapi.json file', () => {
      expect(existsSync(OPENAPI_PATH)).toBe(true);
    });

    it('produces a valid OpenAPI 3.1.0 document', async () => {
      const spec = await Bun.file(OPENAPI_PATH).json();
      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info).toBeDefined();
      expect(spec.paths).toBeDefined();
    });

    it('defines /contacts and /contacts/{id} paths', async () => {
      const spec = await Bun.file(OPENAPI_PATH).json();
      expect(spec.paths['/contacts']).toBeDefined();
      expect(spec.paths['/contacts/{id}']).toBeDefined();
    });

    it('defines all CRUD operations with correct HTTP methods', async () => {
      const spec = await Bun.file(OPENAPI_PATH).json();

      // Collection endpoints
      expect(spec.paths['/contacts'].get).toBeDefined();
      expect(spec.paths['/contacts'].post).toBeDefined();

      // Item endpoints
      expect(spec.paths['/contacts/{id}'].get).toBeDefined();
      expect(spec.paths['/contacts/{id}'].patch).toBeDefined();
      expect(spec.paths['/contacts/{id}'].delete).toBeDefined();
    });

    it('assigns correct operationIds', async () => {
      const spec = await Bun.file(OPENAPI_PATH).json();
      expect(spec.paths['/contacts'].get.operationId).toBe('listContacts');
      expect(spec.paths['/contacts'].post.operationId).toBe('createContacts');
      expect(spec.paths['/contacts/{id}'].get.operationId).toBe('getContacts');
      expect(spec.paths['/contacts/{id}'].patch.operationId).toBe('updateContacts');
      expect(spec.paths['/contacts/{id}'].delete.operationId).toBe('deleteContacts');
    });

    it('uses correct response status codes', async () => {
      const spec = await Bun.file(OPENAPI_PATH).json();
      expect(spec.paths['/contacts'].get.responses['200']).toBeDefined();
      expect(spec.paths['/contacts'].post.responses['201']).toBeDefined();
      expect(spec.paths['/contacts/{id}'].get.responses['200']).toBeDefined();
      expect(spec.paths['/contacts/{id}'].patch.responses['200']).toBeDefined();
    });

    it('POST /contacts request body includes the name field as required', async () => {
      const spec = await Bun.file(OPENAPI_PATH).json();
      const body = spec.paths['/contacts'].post.requestBody;
      expect(body).toBeDefined();
      expect(body.required).toBe(true);

      const schema = body.content['application/json'].schema;
      expect(schema.properties.name).toBeDefined();
      expect(schema.properties.name.type).toBe('string');
      expect(schema.required).toContain('name');
    });

    it('response schema includes all contact model fields', async () => {
      const spec = await Bun.file(OPENAPI_PATH).json();
      const schema =
        spec.paths['/contacts'].get.responses['200'].content['application/json'].schema;
      expect(schema.properties.id).toBeDefined();
      expect(schema.properties.name).toBeDefined();
      expect(schema.properties.email).toBeDefined();
      expect(schema.properties.phone).toBeDefined();
      expect(schema.properties.notes).toBeDefined();
      expect(schema.properties.createdAt).toBeDefined();
      expect(schema.properties.updatedAt).toBeDefined();
    });

    it('tags operations with contacts', async () => {
      const spec = await Bun.file(OPENAPI_PATH).json();
      expect(spec.paths['/contacts'].get.tags).toContain('contacts');
      expect(spec.tags).toContainEqual({ name: 'contacts' });
    });
  });
});
