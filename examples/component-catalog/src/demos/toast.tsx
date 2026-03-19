import { onMount } from '@vertz/ui';
import { Toast } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function ToastDemo() {
  // Initialize Toast client-side only to avoid hydration mismatch.
  // Toast is an imperative factory — its region element gets discarded
  // during SSR hydration, so announce() appends to a detached node.
  // Plain object avoids compiler signal transform.
  const toast: { announce: ((msg: string) => void) | null } = { announce: null };

  onMount(() => {
    const t = Toast({});
    document.body.appendChild(t.region);
    toast.announce = (msg: string) => t.announce(msg);
  });

  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Trigger toast</div>
        <div className={demoStyles.row}>
          <button
            type="button"
            className={demoStyles.demoButton}
            onClick={() => {
              toast.announce?.('Event has been created. You can undo this action.');
            }}
          >
            Show Toast
          </button>
        </div>
      </div>
    </div>
  );
}
