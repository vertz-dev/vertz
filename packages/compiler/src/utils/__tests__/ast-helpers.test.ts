import { describe, expect, it } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import {
  extractObjectLiteral,
  findCallExpressions,
  findMethodCallsOnVariable,
  getArrayElements,
  getBooleanValue,
  getNumberValue,
  getProperties,
  getPropertyValue,
  getSourceLocation,
  getStringValue,
  getVariableNameForCall,
} from '../ast-helpers';

function createProject() {
  return new Project({ useInMemoryFileSystem: true });
}

describe('findCallExpressions', () => {
  it('finds vertz.middleware() call', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const mw = vertz.middleware({ handler: async () => {} });`,
    );
    const results = findCallExpressions(file, 'vertz', 'middleware');
    expect(results).toHaveLength(1);
  });

  it('finds multiple calls of same pattern', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `
      const a = vertz.middleware({ handler: async () => {} });
      const b = vertz.middleware({ handler: async () => {} });
      `,
    );
    const results = findCallExpressions(file, 'vertz', 'middleware');
    expect(results).toHaveLength(2);
  });

  it('returns empty array when no match', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const app = vertz.app({ basePath: '/' });`,
    );
    const results = findCallExpressions(file, 'vertz', 'middleware');
    expect(results).toHaveLength(0);
  });

  it('does not match different object name', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const mw = other.middleware({ handler: async () => {} });`,
    );
    const results = findCallExpressions(file, 'vertz', 'middleware');
    expect(results).toHaveLength(0);
  });

  it('does not match different method name', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const app = vertz.app({ basePath: '/' });`,
    );
    const results = findCallExpressions(file, 'vertz', 'middleware');
    expect(results).toHaveLength(0);
  });

  it('matches vertz.moduleDef() call', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const mod = vertz.moduleDef({ name: 'user' });`,
    );
    const results = findCallExpressions(file, 'vertz', 'moduleDef');
    expect(results).toHaveLength(1);
  });
});

describe('findMethodCallsOnVariable', () => {
  it('finds method calls on a specific variable', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `
      const userRouter = createRouter();
      userRouter.get({ handler: async () => {} });
      userRouter.post({ handler: async () => {} });
      `,
    );
    const results = findMethodCallsOnVariable(file, 'userRouter', 'get');
    expect(results).toHaveLength(1);
  });

  it('does not match same method on different variable', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `
      const userRouter = createRouter();
      const todoRouter = createRouter();
      userRouter.get({ handler: async () => {} });
      todoRouter.get({ handler: async () => {} });
      `,
    );
    const results = findMethodCallsOnVariable(file, 'userRouter', 'get');
    expect(results).toHaveLength(1);
  });

  it('returns empty when variable has no matching method calls', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `
      const userRouter = createRouter();
      userRouter.post({ handler: async () => {} });
      `,
    );
    const results = findMethodCallsOnVariable(file, 'userRouter', 'get');
    expect(results).toHaveLength(0);
  });

  it('finds multiple method calls on same variable', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `
      const router = createRouter();
      router.get({ handler: async () => {} });
      router.get({ handler: async () => {} });
      router.get({ handler: async () => {} });
      `,
    );
    const results = findMethodCallsOnVariable(file, 'router', 'get');
    expect(results).toHaveLength(3);
  });
});

describe('extractObjectLiteral', () => {
  it('extracts object literal at index 0', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `fn({ name: 'test' });`,
    );
    const call = file.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    const result = extractObjectLiteral(call, 0);
    expect(result).not.toBeNull();
  });

  it('extracts object literal at index 1', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `fn('path', { params: 'schema' });`,
    );
    const call = file.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    const result = extractObjectLiteral(call, 1);
    expect(result).not.toBeNull();
  });

  it('returns null when argument is not object literal', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `fn('string');`,
    );
    const call = file.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    const result = extractObjectLiteral(call, 0);
    expect(result).toBeNull();
  });

  it('returns null when argument index is out of bounds', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `fn({ a: 1 });`,
    );
    const call = file.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    const result = extractObjectLiteral(call, 5);
    expect(result).toBeNull();
  });

  it('returns null for no-argument call', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `fn();`,
    );
    const call = file.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    const result = extractObjectLiteral(call, 0);
    expect(result).toBeNull();
  });
});

describe('getPropertyValue', () => {
  function getObj(project: Project, source: string) {
    const file = project.createSourceFile('test.ts', source);
    return file.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)[0]!;
  }

  it('gets property value from object literal', () => {
    const project = createProject();
    const obj = getObj(project, `const o = { prefix: '/users', inject: {} };`);
    const result = getPropertyValue(obj, 'prefix');
    expect(result).not.toBeNull();
  });

  it('returns null for missing property', () => {
    const project = createProject();
    const obj = getObj(project, `const o = { prefix: '/users' };`);
    const result = getPropertyValue(obj, 'nonexistent');
    expect(result).toBeNull();
  });

  it('handles shorthand properties', () => {
    const project = createProject();
    const obj = getObj(project, `const name = 'test'; const o = { name };`);
    const result = getPropertyValue(obj, 'name');
    expect(result).not.toBeNull();
  });
});

describe('getProperties', () => {
  function getObj(project: Project, source: string) {
    const file = project.createSourceFile('test.ts', source);
    return file.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)[0]!;
  }

  it('extracts all property assignments', () => {
    const project = createProject();
    const obj = getObj(project, `const o = { name: 'user', count: 3 };`);
    const props = getProperties(obj);
    expect(props).toHaveLength(2);
    expect(props[0]!.name).toBe('name');
    expect(props[1]!.name).toBe('count');
  });

  it('handles shorthand properties', () => {
    const project = createProject();
    const obj = getObj(project, `const name = 'user'; const o = { name, count: 3 };`);
    const props = getProperties(obj);
    expect(props).toHaveLength(2);
    expect(props[0]!.name).toBe('name');
  });

  it('returns empty array for empty object', () => {
    const project = createProject();
    const obj = getObj(project, `const o = {};`);
    const props = getProperties(obj);
    expect(props).toEqual([]);
  });
});

describe('getStringValue', () => {
  function getExpr(project: Project, source: string) {
    const file = project.createSourceFile('test.ts', source);
    const decl = file.getVariableDeclarationOrThrow('x');
    return decl.getInitializerOrThrow();
  }

  it('extracts string from string literal', () => {
    const project = createProject();
    const expr = getExpr(project, `const x = 'hello';`);
    expect(getStringValue(expr)).toBe('hello');
  });

  it('extracts string from template literal without substitutions', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x = `hello`;');
    expect(getStringValue(expr)).toBe('hello');
  });

  it('returns null for template literal with substitutions', () => {
    const project = createProject();
    const expr = getExpr(project, 'const name = "world"; const x = `hello ${name}`;');
    expect(getStringValue(expr)).toBeNull();
  });

  it('returns null for non-string expression', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x = 42;');
    expect(getStringValue(expr)).toBeNull();
  });

  it('returns null for identifier', () => {
    const project = createProject();
    const expr = getExpr(project, 'const someVar = 1; const x = someVar;');
    expect(getStringValue(expr)).toBeNull();
  });
});

describe('getBooleanValue', () => {
  function getExpr(project: Project, source: string) {
    const file = project.createSourceFile('test.ts', source);
    const decl = file.getVariableDeclarationOrThrow('x');
    return decl.getInitializerOrThrow();
  }

  it('extracts true', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x = true;');
    expect(getBooleanValue(expr)).toBe(true);
  });

  it('extracts false', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x = false;');
    expect(getBooleanValue(expr)).toBe(false);
  });

  it('returns null for non-boolean', () => {
    const project = createProject();
    const expr = getExpr(project, `const x = 'true';`);
    expect(getBooleanValue(expr)).toBeNull();
  });
});

describe('getNumberValue', () => {
  function getExpr(project: Project, source: string) {
    const file = project.createSourceFile('test.ts', source);
    const decl = file.getVariableDeclarationOrThrow('x');
    return decl.getInitializerOrThrow();
  }

  it('extracts integer', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x = 42;');
    expect(getNumberValue(expr)).toBe(42);
  });

  it('extracts float', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x = 3.14;');
    expect(getNumberValue(expr)).toBe(3.14);
  });

  it('extracts negative number', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x = -1;');
    expect(getNumberValue(expr)).toBe(-1);
  });

  it('extracts positive unary number', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x = +42;');
    expect(getNumberValue(expr)).toBe(42);
  });

  it('returns null for string', () => {
    const project = createProject();
    const expr = getExpr(project, `const x = '42';`);
    expect(getNumberValue(expr)).toBeNull();
  });
});

describe('getArrayElements', () => {
  function getExpr(project: Project, source: string) {
    const file = project.createSourceFile('test.ts', source);
    const decl = file.getVariableDeclarationOrThrow('x');
    return decl.getInitializerOrThrow();
  }

  it('extracts elements from array literal', () => {
    const project = createProject();
    const expr = getExpr(project, 'const a = 1; const b = 2; const c = 3; const x = [a, b, c];');
    expect(getArrayElements(expr)).toHaveLength(3);
  });

  it('returns empty array for empty array literal', () => {
    const project = createProject();
    const expr = getExpr(project, 'const x: never[] = [];');
    expect(getArrayElements(expr)).toHaveLength(0);
  });

  it('returns empty array for non-array expression', () => {
    const project = createProject();
    const expr = getExpr(project, `const x = 'not array';`);
    expect(getArrayElements(expr)).toHaveLength(0);
  });
});

describe('getVariableNameForCall', () => {
  it('extracts variable name from const declaration', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const userRouter = createRouter();`,
    );
    const call = file.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(getVariableNameForCall(call)).toBe('userRouter');
  });

  it('extracts variable name from let declaration', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `let mw = vertz.middleware({});`,
    );
    const call = file.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(getVariableNameForCall(call)).toBe('mw');
  });

  it('returns null for bare call (no assignment)', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `doSomething();`,
    );
    const call = file.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(getVariableNameForCall(call)).toBeNull();
  });
});

describe('getSourceLocation', () => {
  it('returns correct file, line, column', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'src/test.ts',
      `const a = 1;\nconst b = 2;`,
    );
    const decl = file.getVariableDeclarationOrThrow('b');
    const loc = getSourceLocation(decl);
    expect(loc.sourceFile).toContain('src/test.ts');
    expect(loc.sourceLine).toBe(2);
    expect(loc.sourceColumn).toBe(7);
  });
});
