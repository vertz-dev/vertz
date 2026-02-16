import { signal } from '../runtime/signal';
import { formDataToObject } from './form-data';
import { validate } from './validation';
/**
 * Create a form instance bound to an SDK method with schema validation.
 *
 * The form provides:
 * - `attrs()` for progressive enhancement (returns action/method from SDK metadata)
 * - `handleSubmit()` returns an event handler for FormData extraction, validation, and SDK submission
 * - `error()` for reactive field-level error access
 * - `submitting` signal for loading state
 */
export function form(sdkMethod, options) {
  const submitting = signal(false);
  const errors = signal({});
  return {
    attrs() {
      return {
        action: sdkMethod.url,
        method: sdkMethod.method,
      };
    },
    submitting,
    handleSubmit(callbacks) {
      return async (formDataOrEvent) => {
        // Extract FormData from event or use directly
        let formData;
        if (formDataOrEvent instanceof Event) {
          formDataOrEvent.preventDefault();
          const target = formDataOrEvent.target;
          formData = new FormData(target);
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
        let response;
        try {
          response = await sdkMethod(result.data);
        } catch (err) {
          submitting.value = false;
          const message = err instanceof Error ? err.message : 'Submission failed';
          const serverErrors = { _form: message };
          errors.value = serverErrors;
          callbacks?.onError?.(serverErrors);
          return;
        }
        submitting.value = false;
        callbacks?.onSuccess?.(response);
      };
    },
    error(field) {
      // Use .value for reactive tracking in components
      const currentErrors = errors.value;
      return currentErrors[field];
    },
  };
}
//# sourceMappingURL=form.js.map
