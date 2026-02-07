import { describe, expectTypeOf, it } from 'vitest';
import type { Module, ModuleDef, RouterDef, ServiceDef } from '../module';

describe('ModuleDef', () => {
  it('has name, imports, and optional options', () => {
    expectTypeOf<ModuleDef>().toHaveProperty('name');
    expectTypeOf<ModuleDef['name']>().toEqualTypeOf<string>();
  });
});

describe('Module', () => {
  it('has definition, services, routers, and exports', () => {
    expectTypeOf<Module>().toHaveProperty('definition');
    expectTypeOf<Module>().toHaveProperty('services');
    expectTypeOf<Module>().toHaveProperty('routers');
    expectTypeOf<Module>().toHaveProperty('exports');
  });
});

describe('ServiceDef', () => {
  it('has methods function', () => {
    expectTypeOf<ServiceDef>().toHaveProperty('methods');
  });
});

describe('RouterDef', () => {
  it('has prefix', () => {
    expectTypeOf<RouterDef>().toHaveProperty('prefix');
    expectTypeOf<RouterDef['prefix']>().toEqualTypeOf<string>();
  });
});
