import { describe, expect, it } from 'bun:test';
import type { CodegenAuthOperation, CodegenIR } from '../../types';
import { AuthSdkGenerator } from '../auth-sdk-generator';

describe('AuthSdkGenerator', () => {
  const generator = new AuthSdkGenerator();

  function createIR(operations: CodegenAuthOperation[]): CodegenIR {
    return {
      basePath: '/api',
      modules: [],
      schemas: [],
      entities: [],
      auth: { schemes: [], operations },
    };
  }

  it('returns no files when there are no auth operations', () => {
    const ir = createIR([]);
    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });

    expect(files).toHaveLength(0);
  });

  it('generates auth.ts when auth operations exist', () => {
    const ir = createIR([
      { operationId: 'signOut', method: 'POST', path: '/signout', hasBody: false },
      { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      { operationId: 'refresh', method: 'POST', path: '/refresh', hasBody: false },
    ]);
    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('auth.ts');
  });

  describe('types', () => {
    it('emits AuthCookie interface', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('export interface AuthCookie');
      expect(content).toContain('name: string');
      expect(content).toContain('httpOnly?: boolean');
      expect(content).toContain("sameSite?: 'Strict' | 'Lax' | 'None'");
    });

    it('emits AuthError type', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('export type AuthErrorCode');
      expect(content).toContain("'INVALID_CREDENTIALS'");
      expect(content).toContain("'NETWORK_ERROR'");
      expect(content).toContain('export interface AuthError extends Error');
    });

    it('emits AuthUser and AuthResponse interfaces', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('export interface AuthUser');
      expect(content).toContain('export interface AuthResponse');
    });

    it('emits SignInInput only when signIn operation exists', () => {
      const irWithout = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const contentWithout = generator.generate(irWithout, {
        outputDir: '.vertz',
        options: {},
      })[0].content;

      expect(contentWithout).not.toContain('export interface SignInInput');

      const irWith = createIR([
        { operationId: 'signIn', method: 'POST', path: '/signin', hasBody: true },
      ]);
      const contentWith = generator.generate(irWith, {
        outputDir: '.vertz',
        options: {},
      })[0].content;

      expect(contentWith).toContain('export interface SignInInput');
      expect(contentWith).toContain('email: string');
      expect(contentWith).toContain('password: string');
    });

    it('emits SignUpInput only when signUp operation exists', () => {
      const irWithout = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const contentWithout = generator.generate(irWithout, {
        outputDir: '.vertz',
        options: {},
      })[0].content;

      expect(contentWithout).not.toContain('export interface SignUpInput');

      const irWith = createIR([
        { operationId: 'signUp', method: 'POST', path: '/signup', hasBody: true },
      ]);
      const contentWith = generator.generate(irWith, {
        outputDir: '.vertz',
        options: {},
      })[0].content;

      expect(contentWith).toContain('export interface SignUpInput');
    });

    it('emits SwitchTenantInput and SwitchTenantResponse only when switchTenant exists', () => {
      const irWith = createIR([
        { operationId: 'switchTenant', method: 'POST', path: '/switch-tenant', hasBody: true },
      ]);
      const content = generator.generate(irWith, {
        outputDir: '.vertz',
        options: {},
      })[0].content;

      expect(content).toContain('export interface SwitchTenantInput');
      expect(content).toContain('export interface SwitchTenantResponse');
    });
  });

  describe('AuthSdk interface', () => {
    it('only includes methods for existing operations', () => {
      const ir = createIR([
        { operationId: 'signIn', method: 'POST', path: '/signin', hasBody: true },
        { operationId: 'signOut', method: 'POST', path: '/signout', hasBody: false },
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('signIn: SdkMethodWithMeta<SignInInput, AuthResponse>');
      expect(content).toContain('signOut: () => Promise<Result<{ ok: true }, AuthError>>');
      expect(content).toContain(
        'session: () => Promise<Result<{ session: AuthSession | null }, AuthError>>',
      );
      expect(content).not.toContain('signUp:');
      expect(content).not.toContain('switchTenant:');
      expect(content).not.toContain('providers:');
    });

    it('includes cookies() method', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('cookies: () => AuthCookie[]');
    });
  });

  describe('cookie jar', () => {
    it('generates cookie jar helper code', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('function parseSetCookies');
      expect(content).toContain('function createCookieJar');
      expect(content).toContain('getSetCookie');
    });
  });

  describe('auth fetch helper', () => {
    it('generates authFetch with CSRF header', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('async function authFetch');
      expect(content).toContain("'X-VTZ-Request': '1'");
    });

    it('includes credentials: include for browser', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain("credentials: IS_BROWSER ? 'include' : undefined");
    });
  });

  describe('createAuthSdk factory', () => {
    it('generates factory function', () => {
      const ir = createIR([
        { operationId: 'signIn', method: 'POST', path: '/signin', hasBody: true },
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain(
        'export function createAuthSdk(options: { basePath: string }): AuthSdk',
      );
      expect(content).toContain('const jar = createCookieJar()');
    });

    it('generates SdkMethodWithMeta for body operations', () => {
      const ir = createIR([
        { operationId: 'signIn', method: 'POST', path: '/signin', hasBody: true },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('const signIn = Object.assign(');
      expect(content).toContain("method: 'POST' as const");
      expect(content).toContain('meta: {}');
      expect(content).toContain('as SdkMethodWithMeta<SignInInput, AuthResponse>');
    });

    it('generates inline function for non-body operations', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('session: () => authFetch');
    });

    it('includes cookies method with browser warning', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain('cookies()');
      expect(content).toContain('IS_BROWSER');
      expect(content).toContain('console.warn');
      expect(content).toContain('jar.getAll()');
    });
  });

  describe('imports', () => {
    it('imports Result from @vertz/fetch', () => {
      const ir = createIR([
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      expect(content).toContain("import type { Result } from '@vertz/fetch'");
    });
  });

  describe('full emailPassword + tenant + providers config', () => {
    it('generates all operations', () => {
      const ir = createIR([
        { operationId: 'signOut', method: 'POST', path: '/signout', hasBody: false },
        { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
        { operationId: 'refresh', method: 'POST', path: '/refresh', hasBody: false },
        { operationId: 'signIn', method: 'POST', path: '/signin', hasBody: true },
        { operationId: 'signUp', method: 'POST', path: '/signup', hasBody: true },
        { operationId: 'switchTenant', method: 'POST', path: '/switch-tenant', hasBody: true },
        { operationId: 'providers', method: 'GET', path: '/providers', hasBody: false },
      ]);
      const content = generator.generate(ir, { outputDir: '.vertz', options: {} })[0].content;

      // All types present
      expect(content).toContain('export interface SignInInput');
      expect(content).toContain('export interface SignUpInput');
      expect(content).toContain('export interface SwitchTenantInput');
      expect(content).toContain('export interface SwitchTenantResponse');

      // All SDK interface methods present
      expect(content).toContain('signIn: SdkMethodWithMeta');
      expect(content).toContain('signUp: SdkMethodWithMeta');
      expect(content).toContain('switchTenant: SdkMethodWithMeta');
      expect(content).toContain('signOut: () => Promise');
      expect(content).toContain('session: () => Promise');
      expect(content).toContain('refresh: () => Promise');
      expect(content).toContain('providers: () => Promise');
    });
  });
});
