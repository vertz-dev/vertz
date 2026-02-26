import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectAppType } from '../app-detector';

describe('detectAppType', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'vertz-detect-'));
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('detects api-only when only src/server.ts exists', () => {
    writeFileSync(join(projectRoot, 'src/server.ts'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.type).toBe('api-only');
    expect(result.serverEntry).toBe(join(projectRoot, 'src/server.ts'));
    expect(result.uiEntry).toBeUndefined();
    expect(result.projectRoot).toBe(projectRoot);
  });

  it('detects full-stack when both src/server.ts and src/app.tsx exist', () => {
    writeFileSync(join(projectRoot, 'src/server.ts'), 'export default {}');
    writeFileSync(join(projectRoot, 'src/app.tsx'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.type).toBe('full-stack');
    expect(result.serverEntry).toBe(join(projectRoot, 'src/server.ts'));
    expect(result.uiEntry).toBe(join(projectRoot, 'src/app.tsx'));
  });

  it('detects full-stack when src/server.ts and src/entry-server.ts exist (backward compat)', () => {
    writeFileSync(join(projectRoot, 'src/server.ts'), 'export default {}');
    writeFileSync(join(projectRoot, 'src/entry-server.ts'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.type).toBe('full-stack');
    expect(result.serverEntry).toBe(join(projectRoot, 'src/server.ts'));
    expect(result.ssrEntry).toBe(join(projectRoot, 'src/entry-server.ts'));
    expect(result.uiEntry).toBeUndefined();
  });

  it('detects ui-only when only src/app.tsx exists', () => {
    writeFileSync(join(projectRoot, 'src/app.tsx'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.type).toBe('ui-only');
    expect(result.uiEntry).toBe(join(projectRoot, 'src/app.tsx'));
    expect(result.serverEntry).toBeUndefined();
  });

  it('detects ui-only when only src/entry-server.ts exists', () => {
    writeFileSync(join(projectRoot, 'src/entry-server.ts'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.type).toBe('ui-only');
    expect(result.ssrEntry).toBe(join(projectRoot, 'src/entry-server.ts'));
    expect(result.serverEntry).toBeUndefined();
    expect(result.uiEntry).toBeUndefined();
  });

  it('throws on empty src/ with helpful message', () => {
    expect(() => detectAppType(projectRoot)).toThrow('No app entry found');
  });

  it('resolves .tsx before .ts for app entry', () => {
    writeFileSync(join(projectRoot, 'src/app.tsx'), 'export default {}');
    writeFileSync(join(projectRoot, 'src/app.ts'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.uiEntry).toBe(join(projectRoot, 'src/app.tsx'));
  });

  it('populates clientEntry when src/entry-client.ts exists', () => {
    writeFileSync(join(projectRoot, 'src/server.ts'), 'export default {}');
    writeFileSync(join(projectRoot, 'src/app.tsx'), 'export default {}');
    writeFileSync(join(projectRoot, 'src/entry-client.ts'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.type).toBe('full-stack');
    expect(result.clientEntry).toBe(join(projectRoot, 'src/entry-client.ts'));
  });

  it('does not detect src/index.ts as UI entry', () => {
    writeFileSync(join(projectRoot, 'src/index.ts'), 'export default {}');

    expect(() => detectAppType(projectRoot)).toThrow('No app entry found');
  });

  it('detects src/server.js as server entry', () => {
    writeFileSync(join(projectRoot, 'src/server.js'), 'module.exports = {}');

    const result = detectAppType(projectRoot);

    expect(result.type).toBe('api-only');
    expect(result.serverEntry).toBe(join(projectRoot, 'src/server.js'));
  });

  it('returns absolute paths for all entries', () => {
    writeFileSync(join(projectRoot, 'src/server.ts'), 'export default {}');
    writeFileSync(join(projectRoot, 'src/app.tsx'), 'export default {}');
    writeFileSync(join(projectRoot, 'src/entry-server.ts'), 'export default {}');
    writeFileSync(join(projectRoot, 'src/entry-client.ts'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.serverEntry?.startsWith('/')).toBe(true);
    expect(result.uiEntry?.startsWith('/')).toBe(true);
    expect(result.ssrEntry?.startsWith('/')).toBe(true);
    expect(result.clientEntry?.startsWith('/')).toBe(true);
  });

  it('has correct projectRoot in result', () => {
    writeFileSync(join(projectRoot, 'src/server.ts'), 'export default {}');

    const result = detectAppType(projectRoot);

    expect(result.projectRoot).toBe(projectRoot);
  });
});
