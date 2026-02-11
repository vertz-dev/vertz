import { signal } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';
import { formDataToObject } from './form-data';
import type { FormSchema } from './validation';
import { validate } from './validation';

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

/** Callbacks for form submission. */
export interface SubmitCallbacks<TResult> {
  onSuccess: (result: TResult) => void;
  onError: (errors: Record<string, string>) => void;
}

/** A form instance bound to an SDK method. */
export interface FormInstance<TBody, TResult> {
  /** Returns `{ action, method }` for progressive enhancement in HTML forms. */
  attrs(): { action: string; method: string };

  /** Reactive signal indicating whether a submission is in progress. */
  submitting: Signal<boolean>;

  /**
   * Extract data from FormData, validate against schema, and call the SDK method.
   * Calls `onSuccess` with the result or `onError` with validation/server errors.
   */
  handleSubmit(formData: FormData, callbacks: SubmitCallbacks<TResult>): Promise<void>;

  /** Returns the error message for a field, or undefined if no error. Type-safe field names. */
  error(field: keyof TBody & string): string | undefined;
}

/**
 * Create a form instance bound to an SDK method with schema validation.
 *
 * The form provides:
 * - `attrs()` for progressive enhancement (returns action/method from SDK metadata)
 * - `handleSubmit()` for FormData extraction, validation, and SDK submission
 * - `error()` for reactive field-level error access
 * - `submitting` signal for loading state
 */
export function form<TBody, TResult>(
  sdkMethod: SdkMethod<TBody, TResult>,
  options: FormOptions<TBody>,
): FormInstance<TBody, TResult> {
  const submitting = signal(false);
  const errors = signal<Record<string, string>>({});

  return {
    attrs() {
      return {
        action: sdkMethod.url,
        method: sdkMethod.method.toLowerCase(),
      };
    },

    submitting,

    async handleSubmit(formData: FormData, callbacks: SubmitCallbacks<TResult>) {
      // Extract form data to plain object
      const data = formDataToObject(formData);

      // Validate against schema
      const result = validate(options.schema, data);

      if (!result.success) {
        errors.value = result.errors;
        callbacks.onError(result.errors);
        return;
      }

      // Clear previous errors on valid submission
      errors.value = {};
      submitting.value = true;

      try {
        const response = await sdkMethod(result.data);
        callbacks.onSuccess(response);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Submission failed';
        const serverErrors = { _form: message };
        errors.value = serverErrors;
        callbacks.onError(serverErrors);
      } finally {
        submitting.value = false;
      }
    },

    error(field: keyof TBody & string) {
      const currentErrors = errors.peek();
      return currentErrors[field];
    },
  };
}
