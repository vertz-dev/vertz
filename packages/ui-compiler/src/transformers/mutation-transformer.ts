import type MagicString from 'magic-string';
import type { ComponentInfo, MutationInfo } from '../types';

/**
 * Transform in-place mutations on signal variables into peek() + notify() pattern.
 *
 * `items.push('x')` → `(items.peek().push('x'), items.notify())`
 * `user.name = "Bob"` → `(user.peek().name = "Bob", user.notify())`
 */
export class MutationTransformer {
  transform(source: MagicString, _component: ComponentInfo, mutations: MutationInfo[]): void {
    if (mutations.length === 0) return;

    // Sort mutations by start position in reverse so we can transform from end to start
    // (avoids position shifting issues)
    const sorted = [...mutations].sort((a, b) => b.start - a.start);

    for (const mutation of sorted) {
      const originalText = source.slice(mutation.start, mutation.end);

      switch (mutation.kind) {
        case 'method-call':
          this._transformMethodCall(source, mutation, originalText);
          break;
        case 'property-assignment':
          this._transformPropertyAssignment(source, mutation, originalText);
          break;
        case 'index-assignment':
          this._transformIndexAssignment(source, mutation, originalText);
          break;
        case 'delete':
          this._transformDelete(source, mutation, originalText);
          break;
        case 'object-assign':
          this._transformObjectAssign(source, mutation, originalText);
          break;
      }
    }
  }

  /** `items.push('x')` → `(items.peek().push('x'), items.notify())` */
  private _transformMethodCall(
    source: MagicString,
    mutation: MutationInfo,
    originalText: string,
  ): void {
    const { variableName } = mutation;
    const peekText = originalText.replaceAll(`${variableName}.`, `${variableName}.peek().`);
    source.overwrite(mutation.start, mutation.end, `(${peekText}, ${variableName}.notify())`);
  }

  /** `user.name = "Bob"` → `(user.peek().name = "Bob", user.notify())` */
  private _transformPropertyAssignment(
    source: MagicString,
    mutation: MutationInfo,
    originalText: string,
  ): void {
    const { variableName } = mutation;
    const peekText = originalText.replaceAll(`${variableName}.`, `${variableName}.peek().`);
    source.overwrite(mutation.start, mutation.end, `(${peekText}, ${variableName}.notify())`);
  }

  /** `items[0] = 99` → `(items.peek()[0] = 99, items.notify())` */
  private _transformIndexAssignment(
    source: MagicString,
    mutation: MutationInfo,
    originalText: string,
  ): void {
    const { variableName } = mutation;
    const peekText = originalText.replaceAll(`${variableName}[`, `${variableName}.peek()[`);
    source.overwrite(mutation.start, mutation.end, `(${peekText}, ${variableName}.notify())`);
  }

  /** `delete config.debug` → `(delete config.peek().debug, config.notify())` */
  private _transformDelete(
    source: MagicString,
    mutation: MutationInfo,
    originalText: string,
  ): void {
    const { variableName } = mutation;
    const peekText = originalText.replaceAll(`${variableName}.`, `${variableName}.peek().`);
    source.overwrite(mutation.start, mutation.end, `(${peekText}, ${variableName}.notify())`);
  }

  /** `Object.assign(user, ...)` → `(Object.assign(user.peek(), ...), user.notify())` */
  private _transformObjectAssign(
    source: MagicString,
    mutation: MutationInfo,
    originalText: string,
  ): void {
    const { variableName } = mutation;
    const peekText = originalText.replace(
      `Object.assign(${variableName}`,
      `Object.assign(${variableName}.peek()`,
    );
    source.overwrite(mutation.start, mutation.end, `(${peekText}, ${variableName}.notify())`);
  }
}
