import { describe, expect, it } from 'bun:test';
import { Project, ts } from 'ts-morph';
import { ComponentAnalyzer } from '../analyzers/component-analyzer';
import { findBodyNode, isShadowedInNestedScope } from '../utils';

function createSourceFile(source: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  return project.createSourceFile('test.tsx', source);
}

describe('isShadowedInNestedScope', () => {
  it('detects shadowing via object destructured parameter', () => {
    const code = `function App() {
  let count = 0;
  const handler = ({ count }: { count: number }) => {
    return count;
  };
  return <div>{count}</div>;
}`;
    const sf = createSourceFile(code);
    const components = new ComponentAnalyzer().analyze(sf);
    const comp = components[0]!;
    const bodyNode = findBodyNode(sf, comp);
    expect(bodyNode).not.toBeNull();

    // Find the `count` identifier inside the arrow function parameter's usage
    const allIdentifiers = sf.getDescendantsOfKind(ts.SyntaxKind.Identifier);
    // The `count` inside `return count;` is in the arrow function body
    const arrowBody = sf.getDescendantsOfKind(ts.SyntaxKind.ArrowFunction)[0]!;
    const returnStmt = arrowBody.getDescendantsOfKind(ts.SyntaxKind.ReturnStatement)[0]!;
    const countInArrow = returnStmt
      .getDescendantsOfKind(ts.SyntaxKind.Identifier)
      .find((id) => id.getText() === 'count')!;

    expect(isShadowedInNestedScope(countInArrow, 'count', bodyNode!)).toBe(true);
  });

  it('detects shadowing via array destructured parameter', () => {
    const code = `function App() {
  let item = 'hello';
  const handler = ([item]: string[]) => {
    return item;
  };
  return <div>{item}</div>;
}`;
    const sf = createSourceFile(code);
    const components = new ComponentAnalyzer().analyze(sf);
    const comp = components[0]!;
    const bodyNode = findBodyNode(sf, comp);
    expect(bodyNode).not.toBeNull();

    const arrowBody = sf.getDescendantsOfKind(ts.SyntaxKind.ArrowFunction)[0]!;
    const returnStmt = arrowBody.getDescendantsOfKind(ts.SyntaxKind.ReturnStatement)[0]!;
    const itemInArrow = returnStmt
      .getDescendantsOfKind(ts.SyntaxKind.Identifier)
      .find((id) => id.getText() === 'item')!;

    expect(isShadowedInNestedScope(itemInArrow, 'item', bodyNode!)).toBe(true);
  });
});
