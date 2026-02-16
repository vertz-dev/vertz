/**
 * ConfirmDialog component — modal confirmation using Dialog primitive.
 *
 * Demonstrates:
 * - Dialog from @vertz/ui-primitives (WAI-ARIA compliant)
 * - Focus trap and Escape to close
 * - Composing primitives with JSX and @vertz/ui styling
 *
 * Note: The Dialog primitive returns pre-wired elements with ARIA attributes,
 * so its creation stays imperative. JSX is used for new elements and composition.
 */
export interface ConfirmDialogProps {
    triggerLabel: string;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
}
/**
 * Create a confirmation dialog with trigger button.
 *
 * Returns a container element with the trigger button and the dialog panel.
 * The dialog is managed entirely by the Dialog primitive from @vertz/ui-primitives.
 */
export declare function ConfirmDialog(props: ConfirmDialogProps): HTMLElement;
//# sourceMappingURL=confirm-dialog.d.ts.map