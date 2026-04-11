// @ts-expect-error — lodash is an external dep for bundling test, not installed
import lodash from 'lodash';

export function greet(name: string): string {
  return lodash.capitalize(`hello ${name}`);
}

export const VERSION = '1.0.0';
