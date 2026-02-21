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

/** Callbacks for form submission. All properties are optional. */
export interface SubmitCallbacks<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (errors: Record<string, string>) => void;
  /** When true, the form element is reset after a successful submission. */
  resetOnSuccess?: boolean;
}

/** A form instance bound to an SDK method. */
export interface FormInstance<TBody, TResult> {
  /**
   * Returns HTML form attributes for progressive enhancement.
   *
   * Usage (destructure — JSX spread is not supported by the compiler):
   * ```tsx
   * const { action, method, onSubmit } = userForm.attrs({ onSuccess });
   * <form action={action} method={method} onSubmit={onSubmit}>
   * ```
   */
  attrs(callbacks?: SubmitCallbacks<TResult>): {
    action: string;
    method: string;
    onSubmit: (e: Event) => Promise<void>;
  };

  /** Reactive signal indicating whether a submission is in progress. */
  submitting: Signal<boolean>;

  /**
   * Returns an event handler for programmatic submission with raw FormData.
   *
   * Prefer `attrs()` for JSX forms. Use `handleSubmit()` for non-JSX scenarios:
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
export function form<TBody, TResult>(
  sdkMethod: SdkMethod<TBody, TResult>,
  options: FormOptions<TBody>,
): FormInstance<TBody, TResult> {
  const submitting = signal(false);
  const errors = signal<Record<string, string>>({});

  function createSubmitHandler(callbacks?: SubmitCallbacks<TResult>) {
    return async (formDataOrEvent: FormData | Event) => {
      // Extract FormData from event or use directly
      let formData: FormData;
      let formElement: HTMLFormElement | undefined;
      if (formDataOrEvent instanceof Event) {
        formDataOrEvent.preventDefault();
        formElement = formDataOrEvent.target as HTMLFormElement;
        formData = new FormData(formElement);
      } else {
        formData = formDataOrEvent;
      }

      // Extract form data to plain object
      const data = formDataToObject(formData);

      // Validate against schema
      const result = validate(options.schema, data);

      if (!result.success) {
        errors.value = result.errors;
        callbacks?.onError?.(result.errors);
        return;
      }

      // Clear previous errors on valid submission
      errors.value = {};
      submitting.value = true;

      let response: TResult;
      try {
        response = await sdkMethod(result.data);
      } catch (err: unknown) {
        submitting.value = false;
        const message = err instanceof Error ? err.message : 'Submission failed';
        const serverErrors = { _form: message };
        errors.value = serverErrors;
        callbacks?.onError?.(serverErrors);
        return;
      }
      submitting.value = false;
      callbacks?.onSuccess?.(response);
      if (callbacks?.resetOnSuccess && formElement) {
        formElement.reset();
      }
    };
  }

  return {
    attrs(callbacks?: SubmitCallbacks<TResult>) {
      return {
        action: sdkMethod.url,
        method: sdkMethod.method,
        onSubmit: createSubmitHandler(callbacks),
      };
    },

    submitting,

    handleSubmit: createSubmitHandler,

    error(field: keyof TBody & string) {
      // Use .value for reactive tracking in components
      const currentErrors = errors.value;
      return currentErrors[field];
    },
  };
}
