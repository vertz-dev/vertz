import type { PaletteTokens } from '../types';
import { grayTokens } from './gray';
import { neutralTokens } from './neutral';
import { slateTokens } from './slate';
import { stoneTokens } from './stone';
import { zincTokens } from './zinc';

export type PaletteName = 'zinc' | 'slate' | 'stone' | 'neutral' | 'gray';

export const palettes: Record<PaletteName, PaletteTokens> = {
  zinc: zincTokens,
  slate: slateTokens,
  stone: stoneTokens,
  neutral: neutralTokens,
  gray: grayTokens,
};
