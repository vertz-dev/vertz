export function isCI() {
  return (
    process.env.CI === 'true' ||
    process.env.CI === '1' ||
    process.env.CONTINUOUS_INTEGRATION === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.GITLAB_CI === 'true'
  );
}
export function requireParam(value, name) {
  if (value === undefined || value === '') {
    throw new Error(`Missing required parameter: ${name}`);
  }
  return value;
}
//# sourceMappingURL=prompt.js.map
