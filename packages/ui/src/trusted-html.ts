declare const TrustedHTMLBrand: unique symbol;

/**
 * Opaque marker for HTML strings the application has vouched for.
 *
 * Assignable to `string` (so it flows through legacy APIs), but a plain
 * `string` is NOT assignable to `TrustedHTML` — produce one via `trusted()`.
 */
export type TrustedHTML = string & { readonly [TrustedHTMLBrand]: 'TrustedHTML' };

/**
 * Mark an HTML string as safe to pass to the JSX `innerHTML` prop. The caller
 * is responsible for ensuring the string does not contain attacker-controlled
 * markup (e.g. by first passing it through `DOMPurify.sanitize`).
 *
 * A future oxlint rule (`no-untrusted-innerHTML`) will flag dynamic `innerHTML`
 * values that are not `TrustedHTML`. Adopting `trusted()` now future-proofs
 * your code.
 *
 * @security XSS: attacker-controlled HTML enables script execution.
 */
export function trusted(html: string): TrustedHTML {
  return html as TrustedHTML;
}
