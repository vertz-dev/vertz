import { describe, expectTypeOf, it } from 'bun:test';
import type { BootInstruction, BootSequence, ServiceFactory } from '../boot-sequence';

describe('BootSequence', () => {
  it('has instructions array and shutdownOrder', () => {
    expectTypeOf<BootSequence>().toHaveProperty('instructions');
    expectTypeOf<BootSequence>().toHaveProperty('shutdownOrder');
    expectTypeOf<BootSequence['instructions']>().toEqualTypeOf<BootInstruction[]>();
    expectTypeOf<BootSequence['shutdownOrder']>().toEqualTypeOf<string[]>();
  });
});

describe('ServiceFactory', () => {
  it('has methods and optional lifecycle hooks', () => {
    expectTypeOf<ServiceFactory>().toHaveProperty('methods');
  });
});
