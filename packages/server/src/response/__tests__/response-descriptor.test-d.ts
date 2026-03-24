import { describe, expectTypeOf, it } from 'bun:test';
import type { ServiceActionDef } from '../../service/types';
import { type ResponseDescriptor, response } from '../response-descriptor';

describe('Type Flow: ResponseDescriptor', () => {
  it('response() preserves generic type', () => {
    const r = response({ token: 'tok' });
    expectTypeOf(r).toEqualTypeOf<ResponseDescriptor<{ token: string }>>();
    expectTypeOf(r.data).toEqualTypeOf<{ token: string }>();
  });

  it('response() with status and headers preserves data type', () => {
    const r = response({ id: 123 }, { status: 201, headers: { 'X-Custom': 'val' } });
    expectTypeOf(r.data).toEqualTypeOf<{ id: number }>();
    expectTypeOf(r.status).toEqualTypeOf<number | undefined>();
    expectTypeOf(r.headers).toEqualTypeOf<Record<string, string> | undefined>();
  });

  it('handler return type accepts ResponseDescriptor<TOutput>', () => {
    type Handler = ServiceActionDef<void, { token: string }>['handler'];
    const handler1: Handler = async () => response({ token: 'tok' });
    expectTypeOf(handler1).toMatchTypeOf<Handler>();
  });

  it('handler return type accepts plain TOutput (backward compat)', () => {
    type Handler = ServiceActionDef<void, { token: string }>['handler'];
    const handler2: Handler = async () => ({ token: 'tok' });
    expectTypeOf(handler2).toMatchTypeOf<Handler>();
  });

  it('handler return type rejects wrong data type in response()', () => {
    type Handler = ServiceActionDef<void, { token: string }>['handler'];
    // @ts-expect-error — wrong data type: { wrong: boolean } is not { token: string }
    const handler3: Handler = async () => response({ wrong: true });
    void handler3;
  });
});
