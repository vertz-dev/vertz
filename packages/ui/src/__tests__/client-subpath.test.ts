import { describe, expect, it } from '@vertz/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * #2813 — `@vertz/ui/client` subpath export.
 *
 * `@vertz/ui/client` is the canonical source for the `ImportMeta.hot`
 * augmentation. `vertz/client` (in the meta-package) re-exports it via a
 * triple-slash reference, so the two cannot drift.
 */

const uiRoot = resolve(import.meta.dirname, '../..');
const vertzRoot = resolve(uiRoot, '../vertz');

describe('@vertz/ui/client subpath', () => {
  it('client.d.ts exists at the package root', () => {
    expect(existsSync(resolve(uiRoot, 'client.d.ts'))).toBe(true);
  });

  it('package.json exposes ./client as a types-only export', () => {
    const pkg = JSON.parse(readFileSync(resolve(uiRoot, 'package.json'), 'utf-8'));
    const entry = pkg.exports['./client'];
    expect(entry).toBeDefined();
    expect(entry.types).toBe('./client.d.ts');
    expect(entry.import).toBeUndefined();
  });

  it('package.json files array includes client.d.ts for publishing', () => {
    const pkg = JSON.parse(readFileSync(resolve(uiRoot, 'package.json'), 'utf-8'));
    expect(pkg.files).toContain('client.d.ts');
  });

  it('client.d.ts declares ImportMetaHot and the ImportMeta.hot member', () => {
    const contents = readFileSync(resolve(uiRoot, 'client.d.ts'), 'utf-8');
    expect(contents).toContain('declare global');
    expect(contents).toContain('interface ImportMetaHot');
    expect(contents).toContain('interface ImportMeta');
    expect(contents).toContain('readonly hot: ImportMetaHot | undefined');
  });
});

describe('@vertz/ui/client and vertz/client parity (anti-regression for #2813)', () => {
  it('vertz/client re-exports @vertz/ui/client via triple-slash reference', () => {
    const vertzClient = readFileSync(resolve(vertzRoot, 'client.d.ts'), 'utf-8');
    expect(vertzClient).toContain('/// <reference types="@vertz/ui/client" />');
  });

  it('vertz/client does not declare its own augmentation (delegates to @vertz/ui/client)', () => {
    const vertzClient = readFileSync(resolve(vertzRoot, 'client.d.ts'), 'utf-8');
    expect(vertzClient).not.toContain('declare global');
    expect(vertzClient).not.toContain('interface ImportMetaHot');
  });
});
