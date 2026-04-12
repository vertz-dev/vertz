// This file intentionally has a type error for testing tsc error propagation
export function add(a: number, b: number): string {
  // Return type is string but we return number — tsc will report this
  return a + b;
}
