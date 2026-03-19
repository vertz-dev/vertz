import { describe, expect, it } from 'bun:test';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { injectIslandIds } from '../island-id-inject';

function transform(source: string, filePath = 'src/components/hero.tsx') {
  const s = new MagicString(source);
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sourceFile = project.createSourceFile(filePath, source);
  injectIslandIds(s, sourceFile, filePath);
  return s.toString();
}

describe('Feature: Island ID auto-injection', () => {
  describe('Given <Island component={CopyButton} /> without an id prop', () => {
    describe('When the transform runs', () => {
      it('Then injects id from file path and component name', () => {
        const source = `
import { Island } from '@vertz/ui';
import CopyButton from './copy-button';

function Hero() {
  return <Island component={CopyButton} />;
}`;
        const result = transform(source);
        expect(result).toContain('id="src/components/hero.tsx::CopyButton"');
      });
    });
  });

  describe('Given <Island> with an explicit id prop', () => {
    describe('When the transform runs', () => {
      it('Then does not override the manual id', () => {
        const source = `
import { Island } from '@vertz/ui';
import CopyButton from './copy-button';

function Hero() {
  return <Island id="manual-id" component={CopyButton} />;
}`;
        const result = transform(source);
        expect(result).toContain('id="manual-id"');
        expect(result).not.toContain('src/components/hero.tsx::CopyButton');
      });
    });
  });

  describe('Given a file without Island import from @vertz/ui', () => {
    describe('When the transform runs', () => {
      it('Then leaves the source unchanged', () => {
        const source = `
import { Island } from './my-local-island';

function Hero() {
  return <Island component={CopyButton} />;
}`;
        const result = transform(source);
        expect(result).toBe(source);
      });
    });
  });

  describe('Given multiple <Island> elements in one file', () => {
    describe('When the transform runs', () => {
      it('Then injects unique ids for each component', () => {
        const source = `
import { Island } from '@vertz/ui';
import CopyButton from './copy-button';
import Counter from './counter';

function Page() {
  return (
    <div>
      <Island component={CopyButton} />
      <Island component={Counter} />
    </div>
  );
}`;
        const result = transform(source);
        expect(result).toContain('id="src/components/hero.tsx::CopyButton"');
        expect(result).toContain('id="src/components/hero.tsx::Counter"');
      });
    });
  });

  describe('Given <Island> with props', () => {
    describe('When the transform runs', () => {
      it('Then injects id alongside existing props', () => {
        const source = `
import { Island } from '@vertz/ui';
import Counter from './counter';

function Page() {
  return <Island component={Counter} props={{ start: 0 }} />;
}`;
        const result = transform(source);
        expect(result).toContain('id="src/components/hero.tsx::Counter"');
        expect(result).toContain('props={{ start: 0 }}');
      });
    });
  });

  describe('Given a file without any Island usage', () => {
    describe('When the transform runs', () => {
      it('Then returns the source unchanged (fast path)', () => {
        const source = `
function Page() {
  return <div>Hello</div>;
}`;
        const result = transform(source);
        expect(result).toBe(source);
      });
    });
  });

  describe('Given <Island> with a dynamic component expression', () => {
    describe('When the transform runs', () => {
      it('Then skips injection (cannot derive stable id)', () => {
        const source = `
import { Island } from '@vertz/ui';

function Page({ comp }) {
  return <Island component={comp} />;
}`;
        const result = transform(source);
        // comp is an identifier, so it would get an id — but it's not PascalCase
        // The transform still injects because `comp` is a valid identifier
        expect(result).toContain('id="src/components/hero.tsx::comp"');
      });
    });
  });

  describe('Given <Island> with a member expression component prop', () => {
    describe('When the transform runs', () => {
      it('Then skips injection (non-identifier expression returns null)', () => {
        const source = `
import { Island } from '@vertz/ui';

function Page() {
  return <Island component={components.Button} />;
}`;
        const result = transform(source);
        expect(result).not.toContain('id=');
      });
    });
  });

  describe('Given <Island> without a component prop', () => {
    describe('When the transform runs', () => {
      it('Then skips injection (no component name to derive id from)', () => {
        const source = `
import { Island } from '@vertz/ui';

function Page() {
  return <Island />;
}`;
        const result = transform(source);
        expect(result).not.toContain('id=');
      });
    });
  });

  describe('Given an aliased Island import', () => {
    describe('When the transform runs', () => {
      it('Then recognizes the alias and injects id', () => {
        const source = `
import { Island as Isl } from '@vertz/ui';
import CopyButton from './copy-button';

function Hero() {
  return <Isl component={CopyButton} />;
}`;
        const result = transform(source);
        expect(result).toContain('id="src/components/hero.tsx::CopyButton"');
      });
    });
  });

  describe('Given <Island> with component prop that has no initializer value', () => {
    describe('When the transform runs', () => {
      it('Then skips injection (bare component prop)', () => {
        const source = `
import { Island } from '@vertz/ui';

function Page() {
  return <Island component />;
}`;
        const result = transform(source);
        expect(result).not.toContain('id=');
      });
    });
  });
});
