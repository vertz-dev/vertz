import type MagicString from 'magic-string';
import type { ComponentInfo, MutationInfo } from '../types';
/**
 * Transform in-place mutations on signal variables into peek() + notify() pattern.
 *
 * `items.push('x')` → `(items.peek().push('x'), items.notify())`
 * `user.name = "Bob"` → `(user.peek().name = "Bob", user.notify())`
 */
export declare class MutationTransformer {
  transform(source: MagicString, _component: ComponentInfo, mutations: MutationInfo[]): void;
  /** `items.push('x')` → `(items.peek().push('x'), items.notify())` */
  private _transformMethodCall;
  /** `user.name = "Bob"` → `(user.peek().name = "Bob", user.notify())` */
  private _transformPropertyAssignment;
  /** `items[0] = 99` → `(items.peek()[0] = 99, items.notify())` */
  private _transformIndexAssignment;
  /** `delete config.debug` → `(delete config.peek().debug, config.notify())` */
  private _transformDelete;
  /** `Object.assign(user, ...)` → `(Object.assign(user.peek(), ...), user.notify())` */
  private _transformObjectAssign;
}
//# sourceMappingURL=mutation-transformer.d.ts.map
