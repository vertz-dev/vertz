export const symbols: Readonly<{
  success: string;
  error: string;
  warning: string;
  info: string;
  arrow: string;
  pointer: string;
  bullet: string;
  dash: string;
}> = Object.freeze({
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
  arrow: '\u279C',
  pointer: '\u276F',
  bullet: '\u25CF',
  dash: '\u2500',
});

export const colors: Readonly<{
  success: string;
  error: string;
  warning: string;
  info: string;
  dim: string;
  method: Readonly<{
    GET: string;
    POST: string;
    PUT: string;
    PATCH: string;
    DELETE: string;
  }>;
}> = Object.freeze({
  success: 'greenBright',
  error: 'redBright',
  warning: 'yellowBright',
  info: 'cyanBright',
  dim: 'gray',
  method: Object.freeze({
    GET: 'greenBright',
    POST: 'blueBright',
    PUT: 'yellowBright',
    PATCH: 'cyanBright',
    DELETE: 'redBright',
  }),
});
