export function isCI(): boolean {
  return process.env.CI === 'true' || process.env.CI === '1';
}
