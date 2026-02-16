/**
 * TaskForm component — create-task form with validation.
 *
 * Demonstrates:
 * - JSX for form layout with multiple fields
 * - form() with schema validation (external signals — still use .value)
 * - SdkMethod metadata for progressive enhancement
 * - effect() for reactive updates driven by external signals (form state)
 *
 * Note: All reactive state here comes from form() (external signals),
 * so effect() is still needed. No local `let` → signal transform applies.
 */
import type { Task } from '../lib/types';
export interface TaskFormProps {
    onSuccess: (task: Task) => void;
    onCancel: () => void;
}
/**
 * Render the create-task form.
 *
 * Uses form() to bind to the taskApi.create SDK method with schema validation.
 */
export declare function TaskForm(props: TaskFormProps): HTMLFormElement;
//# sourceMappingURL=task-form.d.ts.map