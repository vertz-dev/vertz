import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adapter } from '~runtime-adapter';
import { createIntegrationServer, type TestServer } from './create-app';

describe('createIntegrationServer', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createIntegrationServer(adapter);
  });

  afterAll(async () => {
    await server.stop();
  });

  it('returns a server with a valid port and url', () => {
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://localhost:${server.port}`);
  });

  it('responds to real HTTP requests via fetch helper', async () => {
    const res = await server.fetch('/api/users', {
      headers: { authorization: 'Bearer user-1' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
  });
});
