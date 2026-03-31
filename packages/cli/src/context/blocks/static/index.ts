import type { ContextBlock } from '../../types';
import { apiConventionsBlock } from './api-conventions';
import { cliCommandsBlock } from './cli-commands';
import { uiConventionsBlock } from './ui-conventions';

/** All static context blocks (framework conventions that don't change per project) */
export const STATIC_BLOCKS: ContextBlock[] = [
  cliCommandsBlock,
  apiConventionsBlock,
  uiConventionsBlock,
];
