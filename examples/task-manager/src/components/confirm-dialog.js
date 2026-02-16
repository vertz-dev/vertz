/**
 * ConfirmDialog component — modal confirmation using Dialog primitive.
 *
 * Demonstrates:
 * - Dialog from @vertz/primitives (WAI-ARIA compliant)
 * - Focus trap and Escape to close
 * - Composing primitives with JSX and @vertz/ui styling
 *
 * Note: The Dialog primitive returns pre-wired elements with ARIA attributes,
 * so its creation stays imperative. JSX is used for new elements and composition.
 */
import { Dialog } from '@vertz/primitives';
import { css } from '@vertz/ui';
import { button } from '../styles/components';
const dialogStyles = css({
    overlay: ['fixed', 'inset:0', 'bg:gray.900', 'opacity:50', 'z:40'],
    wrapper: ['fixed', 'inset:0', 'flex', 'items:center', 'justify:center', 'z:50'],
    panel: ['bg:background', 'rounded:lg', 'shadow:xl', 'p:6', 'max-w:md', 'w:full'],
    title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:2'],
    description: ['text:sm', 'text:muted', 'mb:6'],
    actions: ['flex', 'justify:end', 'gap:2'],
});
/**
 * Create a confirmation dialog with trigger button.
 *
 * Returns a container element with the trigger button and the dialog panel.
 * The dialog is managed entirely by the Dialog primitive from @vertz/primitives.
 */
export function ConfirmDialog(props) {
    const { triggerLabel, title: titleText, description, confirmLabel = 'Confirm', onConfirm, } = props;
    // Create the Dialog primitive — it returns pre-wired elements with ARIA
    const dialog = Dialog.Root({ modal: true });
    // Style the pre-wired Dialog elements
    dialog.trigger.className = button({ intent: 'danger', size: 'sm' });
    dialog.trigger.textContent = triggerLabel;
    dialog.trigger.setAttribute('data-testid', 'confirm-dialog-trigger');
    // Style the overlay (semi-transparent backdrop)
    dialog.overlay.className = dialogStyles.classNames.overlay;
    dialog.content.className = dialogStyles.classNames.panel;
    dialog.content.setAttribute('data-testid', 'confirm-dialog-content');
    dialog.title.className = dialogStyles.classNames.title;
    dialog.title.textContent = titleText;
    dialog.close.className = button({ intent: 'secondary', size: 'sm' });
    dialog.close.textContent = 'Cancel';
    // Build dialog body with JSX — compose primitive elements with new ones
    dialog.content.append(dialog.title, (<p class={dialogStyles.classNames.description}>{description}</p>), (<div class={dialogStyles.classNames.actions}>
        {dialog.close}
        <button type="button" class={button({ intent: 'danger', size: 'sm' })} data-testid="confirm-action" onClick={() => {
            onConfirm();
            dialog.close.click();
        }}>
          {confirmLabel}
        </button>
      </div>));
    // Wrap trigger, overlay, and content in a container using JSX
    return (<div>
      {dialog.trigger}
      {dialog.overlay}
      {dialog.content}
    </div>);
}
//# sourceMappingURL=confirm-dialog.js.map