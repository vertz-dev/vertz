import type { Signal } from '@vertz/ui';
import { Spinner } from '../components/Spinner';
import { useKeyboard } from '../input/hooks';
import { __append, __child, __element, __staticText } from '../internals';
import { symbols } from '../theme';
import type { TuiElement } from '../tui-element';
import type { AuthStatus } from './types';

export interface DeviceCodeDisplayProps {
  title?: string;
  userCode: Signal<string>;
  verificationUri: Signal<string>;
  secondsRemaining: Signal<number>;
  status: Signal<AuthStatus>;
  onCancel?: () => void;
  onOpenBrowser?: () => void;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function DeviceCodeDisplay({
  title = 'Authenticate',
  userCode,
  verificationUri,
  secondsRemaining,
  status,
  onCancel,
  onOpenBrowser,
}: DeviceCodeDisplayProps): TuiElement {
  useKeyboard((key) => {
    if (key.name === 'escape' && onCancel) {
      onCancel();
    } else if (key.name === 'return' && onOpenBrowser) {
      onOpenBrowser();
    }
  });

  const outer = __element(
    'Box',
    'border',
    'round',
    'paddingX',
    2,
    'paddingY',
    1,
    'direction',
    'column',
  );

  // Title
  const titleEl = __element('Text', 'bold', true);
  __append(titleEl, __staticText(title));
  __append(outer, titleEl);

  // Spacer
  const spacer1 = __element('Text');
  __append(spacer1, __staticText(''));
  __append(outer, spacer1);

  // URL row
  const urlRow = __element('Box', 'direction', 'row', 'gap', 1);
  const urlLabel = __element('Text', 'dim', true);
  __append(urlLabel, __staticText('Visit:'));
  const urlValue = __element('Text');
  __append(
    urlValue,
    __child(() => verificationUri.value),
  );
  __append(urlRow, urlLabel);
  __append(urlRow, urlValue);
  __append(outer, urlRow);

  // Code row
  const codeRow = __element('Box', 'direction', 'row', 'gap', 1);
  const codeLabel = __element('Text', 'dim', true);
  __append(codeLabel, __staticText('Code:'));
  const codeValue = __element('Text', 'bold', true);
  __append(
    codeValue,
    __child(() => userCode.value),
  );
  __append(codeRow, codeLabel);
  __append(codeRow, codeValue);
  __append(outer, codeRow);

  // Spacer
  const spacer2 = __element('Text');
  __append(spacer2, __staticText(''));
  __append(outer, spacer2);

  // Status row
  const statusText = __element('Text');
  __append(
    statusText,
    __child(() => {
      const s = status.value;
      const remaining = formatCountdown(secondsRemaining.value);
      switch (s) {
        case 'awaiting-approval':
        case 'polling':
          return `Waiting for approval... (${remaining})`;
        case 'success':
          return `${symbols.success} Authenticated!`;
        case 'expired':
          return `${symbols.warning} Code expired`;
        case 'denied':
          return `${symbols.error} Authorization denied`;
        case 'error':
          return `${symbols.error} Authentication failed`;
        default:
          return '';
      }
    }),
  );

  // Only show spinner when waiting
  const spinnerContainer = __element('Box', 'direction', 'row', 'gap', 1);
  const spinnerEl = Spinner({});
  __append(spinnerContainer, spinnerEl);
  __append(spinnerContainer, statusText);
  __append(outer, spinnerContainer);

  // Spacer
  const spacer3 = __element('Text');
  __append(spacer3, __staticText(''));
  __append(outer, spacer3);

  // Hints
  const hint1 = __element('Text', 'dim', true);
  __append(hint1, __staticText('Press Enter to open browser'));
  __append(outer, hint1);

  const hint2 = __element('Text', 'dim', true);
  __append(hint2, __staticText('Press Esc to cancel'));
  __append(outer, hint2);

  return outer;
}
