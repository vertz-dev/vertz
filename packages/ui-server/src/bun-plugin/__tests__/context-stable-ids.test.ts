import { describe, expect, it } from 'bun:test';
import MagicString from 'magic-string';
import ts from 'typescript';
import { injectContextStableIds } from '../context-stable-ids';

function transform(source: string, filePath = 'src/contexts/settings.tsx') {
  const s = new MagicString(source);
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  injectContextStableIds(s, sourceFile, filePath);
  return s.toString();
}

describe('Feature: Context stable ID injection', () => {
  describe('Given createContext() with no arguments', () => {
    describe('When the transform runs', () => {
      it('Then injects undefined and stable ID as arguments', () => {
        const source = `import { createContext } from '@vertz/ui';
const SettingsContext = createContext();`;
        const result = transform(source);
        expect(result).toContain(
          "createContext(undefined, 'src/contexts/settings.tsx::SettingsContext')",
        );
      });
    });
  });

  describe('Given createContext(defaultValue) with one argument', () => {
    describe('When the transform runs', () => {
      it('Then appends stable ID as second argument', () => {
        const source = `import { createContext } from '@vertz/ui';
const ThemeContext = createContext(null);`;
        const result = transform(source);
        expect(result).toContain("createContext(null, 'src/contexts/settings.tsx::ThemeContext')");
      });
    });
  });

  describe('Given a file with multiple createContext calls', () => {
    describe('When the transform runs', () => {
      it('Then injects unique stable IDs for each context', () => {
        const source = `import { createContext } from '@vertz/ui';
const Ctx1 = createContext();
const Ctx2 = createContext('default');`;
        const result = transform(source);
        expect(result).toContain("undefined, 'src/contexts/settings.tsx::Ctx1'");
        expect(result).toContain("'default', 'src/contexts/settings.tsx::Ctx2'");
      });
    });
  });

  describe('Given a non-createContext call expression', () => {
    describe('When the transform runs', () => {
      it('Then leaves the source unchanged', () => {
        const source = `const result = otherFunction();`;
        const result = transform(source);
        expect(result).toBe(source);
      });
    });
  });

  describe('Given a variable declaration without an initializer', () => {
    describe('When the transform runs', () => {
      it('Then leaves the source unchanged', () => {
        const source = `let x: number;`;
        const result = transform(source);
        expect(result).toBe(source);
      });
    });
  });

  describe('Given a non-variable statement', () => {
    describe('When the transform runs', () => {
      it('Then leaves the source unchanged', () => {
        const source = `function foo() { return 1; }`;
        const result = transform(source);
        expect(result).toBe(source);
      });
    });
  });

  describe('Given a destructured createContext call', () => {
    describe('When the transform runs', () => {
      it('Then skips injection (name is not an identifier)', () => {
        const source = `import { createContext } from '@vertz/ui';
const { Provider } = createContext();`;
        const result = transform(source);
        // Should NOT inject a stable ID since the declaration name is destructured
        expect(result).toBe(source);
      });
    });
  });

  describe('Given a file path with special characters', () => {
    describe('When the transform runs', () => {
      it('Then escapes single quotes and backslashes in the path', () => {
        const source = `import { createContext } from '@vertz/ui';
const Ctx = createContext();`;
        const result = transform(source, "src/it's\\weird.tsx");
        expect(result).toContain("it\\'s\\\\weird.tsx::Ctx");
      });
    });
  });

  describe('Given a non-call-expression initializer', () => {
    describe('When the transform runs', () => {
      it('Then leaves the source unchanged', () => {
        const source = `const x = 42;`;
        const result = transform(source);
        expect(result).toBe(source);
      });
    });
  });
});
