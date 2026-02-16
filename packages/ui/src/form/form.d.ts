import type { Signal } from '../runtime/signal-types';
import type { FormSchema } from './validation';
/**
 * An SDK method with endpoint metadata attached.
 * Generated SDK methods expose `.url` and `.method` for progressive enhancement.
 */
export interface SdkMethod<TBody, TResult> {
  (body: TBody): Promise<TResult>;
  url: string;
  method: string;
}
/** Options for creating a form instance. */
export interface FormOptions<TBody> {
  /** Explicit schema for client-side validation before submission. */
  schema: FormSchema<TBody>;
}
/** Callbacks for form submission. Both are optional per spec. */
export interface SubmitCallbacks<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (errors: Record<string, string>) => void;
}
/** A form instance bound to an SDK method. */
export interface FormInstance<TBody, TResult> {
  /** Returns `{ action, method }` for progressive enhancement in HTML forms. */
  attrs(): {
    action: string;
    method: string;
  };
  /** Reactive signal indicating whether a submission is in progress. */
  submitting: Signal<boolean>;
  /**
   * Returns an event handler that extracts FormData, validates, and submits.
   * Assignable to onSubmit: `onSubmit={userForm.handleSubmit({ onSuccess })}`.
   *
   * Can also be called directly with FormData for non-DOM usage:
   * `userForm.handleSubmit({ onSuccess })(formData)`.
   */
  handleSubmit(
    callbacks?: SubmitCallbacks<TResult>,
  ): (formDataOrEvent: FormData | Event) => Promise<void>;
  /** Returns the error message for a field reactively, or undefined if no error. Type-safe field names. */
  error(field: keyof TBody & string): string | undefined;
}
/**
 * Create a form instance bound to an SDK method with schema validation.
 *
 * The form provides:
 * - `attrs()` for progressive enhancement (returns action/method from SDK metadata)
 * - `handleSubmit()` returns an event handler for FormData extraction, validation, and SDK submission
 * - `error()` for reactive field-level error access
 * - `submitting` signal for loading state
 */
export declare function form<TBody, TResult>(
  sdkMethod: SdkMethod<TBody, TResult>,
  options: FormOptions<TBody>,
): FormInstance<TBody, TResult>;
//# sourceMappingURL=form.d.ts.map
