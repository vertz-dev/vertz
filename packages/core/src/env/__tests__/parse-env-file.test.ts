import { describe, expect, it } from 'bun:test';
import { parseEnvFile } from '../parse-env-file';

describe('parseEnvFile', () => {
  describe('Given content with simple KEY=VALUE pairs', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then returns an object with each key-value pair', () => {
        const content = 'FOO=bar\nBAZ=qux';
        expect(parseEnvFile(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
      });
    });
  });

  describe('Given content with blank lines and comment lines', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then skips blank lines', () => {
        const content = 'FOO=bar\n\n\nBAZ=qux';
        expect(parseEnvFile(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
      });

      it('Then skips lines starting with #', () => {
        const content = '# this is a comment\nFOO=bar\n# another comment\nBAZ=qux';
        expect(parseEnvFile(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
      });
    });
  });

  describe('Given a value wrapped in single quotes', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then strips the quotes and preserves content literally', () => {
        const content = "FOO='hello world'\nBAR='has \\n literal'";
        expect(parseEnvFile(content)).toEqual({
          FOO: 'hello world',
          BAR: 'has \\n literal',
        });
      });
    });
  });

  describe('Given a value wrapped in double quotes', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then strips the quotes', () => {
        const content = 'FOO="hello world"';
        expect(parseEnvFile(content)).toEqual({ FOO: 'hello world' });
      });

      it('Then interprets escaped newlines as actual newlines', () => {
        const content = 'FOO="line1\\nline2"';
        expect(parseEnvFile(content)).toEqual({ FOO: 'line1\nline2' });
      });

      it('Then interprets escaped quotes as literal quotes', () => {
        const content = 'FOO="say \\"hello\\""';
        expect(parseEnvFile(content)).toEqual({ FOO: 'say "hello"' });
      });

      it('Then interprets escaped backslashes as literal backslashes', () => {
        const content = 'FOO="path\\\\to\\\\file"';
        expect(parseEnvFile(content)).toEqual({ FOO: 'path\\to\\file' });
      });
    });
  });

  describe('Given an unquoted value with inline comment', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then strips the inline comment after space-hash', () => {
        const content = 'FOO=bar # this is a comment';
        expect(parseEnvFile(content)).toEqual({ FOO: 'bar' });
      });
    });
  });

  describe('Given a line with export prefix', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then strips the export keyword and parses normally', () => {
        const content = 'export FOO=bar\nexport BAZ=qux';
        expect(parseEnvFile(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
      });
    });
  });

  describe('Given KEY= with no value', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then returns empty string for that key', () => {
        const content = 'FOO=';
        expect(parseEnvFile(content)).toEqual({ FOO: '' });
      });
    });
  });

  describe('Given a line without an equals sign', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then skips that line', () => {
        const content = 'FOO=bar\nINVALID_LINE\nBAZ=qux';
        expect(parseEnvFile(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
      });
    });
  });

  describe('Given an empty string', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then returns an empty object', () => {
        expect(parseEnvFile('')).toEqual({});
      });
    });
  });

  describe('Given values with equals signs in the value', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then splits only on the first equals sign', () => {
        const content = 'DATABASE_URL=postgres://user:pass@host/db?sslmode=require';
        expect(parseEnvFile(content)).toEqual({
          DATABASE_URL: 'postgres://user:pass@host/db?sslmode=require',
        });
      });
    });
  });

  describe('Given keys with leading/trailing whitespace', () => {
    describe('When calling parseEnvFile()', () => {
      it('Then trims whitespace around keys', () => {
        const content = '  FOO  =bar';
        expect(parseEnvFile(content)).toEqual({ FOO: 'bar' });
      });
    });
  });
});
