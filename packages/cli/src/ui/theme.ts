export const symbols = {
  error: '\u2716',
  warning: '\u26A0',
  success: '\u2714',
  info: '\u2139',
  pointer: '\u276F',
  bullet: '\u25CF',
  dash: '\u2500',
} as const;

export const colors = {
  error: '\x1b[31m',
  warning: '\x1b[33m',
  success: '\x1b[32m',
  info: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
} as const;
