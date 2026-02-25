import { execFile } from 'node:child_process';
import { signal } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import type { TuiMountOptions } from '../app';
import { tui } from '../app';
import { isInteractive } from '../interactive';
import { symbols } from '../theme';
import type { TuiElement } from '../tui-element';
import { DeviceCodeDisplay } from './device-code-display';
import { pollTokenUntilComplete, requestDeviceCode } from './device-code-flow';
import type { AuthConfig, AuthStatus, AuthTokens } from './types';
import { AuthCancelledError } from './types';

function write(text: string): void {
  process.stdout.write(`${text}\n`);
}

export interface DeviceCodeAuthOptions extends AuthConfig {
  /** Internal: test mount options. */
  _mountOptions?: TuiMountOptions;
}

/** High-level imperative device code auth flow. */
export async function DeviceCodeAuth(config: DeviceCodeAuthOptions): Promise<AuthTokens> {
  if (!config._mountOptions && !isInteractive()) {
    return runNonInteractive(config);
  }
  return runInteractive(config);
}

async function runNonInteractive(config: AuthConfig): Promise<AuthTokens> {
  write(`${symbols.info} Starting device code authentication...`);

  const deviceCode = await requestDeviceCode(config);

  write(`${symbols.arrow} Visit: ${deviceCode.verification_uri}`);
  write(`${symbols.arrow} Code:  ${deviceCode.user_code}`);
  write(`${symbols.info} Waiting for approval...`);

  const tokens = await pollTokenUntilComplete(config, deviceCode);

  write(`${symbols.success} Authenticated successfully.`);
  return tokens;
}

async function runInteractive(config: DeviceCodeAuthOptions): Promise<AuthTokens> {
  return new Promise((resolve, reject) => {
    let handle: ReturnType<typeof tui.mount> | null = null;
    let abortController: AbortController | null = null;

    function App(): TuiElement {
      const userCode = signal('');
      const verificationUri = signal('');
      const secondsRemaining = signal(0);
      const status = signal<AuthStatus>('requesting-code');

      abortController = new AbortController();

      // Start the flow
      requestDeviceCode(config)
        .then((deviceCode) => {
          userCode.value = deviceCode.user_code;
          verificationUri.value = deviceCode.verification_uri;
          secondsRemaining.value = deviceCode.expires_in;
          status.value = 'awaiting-approval';

          // Countdown timer
          const countdownTimer = setInterval(() => {
            if (secondsRemaining.value > 0) {
              secondsRemaining.value--;
            }
          }, 1000);

          _tryOnCleanup(() => clearInterval(countdownTimer));

          // Poll for token
          return pollTokenUntilComplete(config, deviceCode, abortController?.signal);
        })
        .then((tokens) => {
          status.value = 'success';
          handle?.unmount();
          resolve(tokens);
        })
        .catch((err) => {
          if (err instanceof AuthCancelledError) {
            status.value = 'cancelled';
          } else {
            status.value = 'error';
          }
          handle?.unmount();
          reject(err);
        });

      return DeviceCodeDisplay({
        title: config.title,
        userCode,
        verificationUri,
        secondsRemaining,
        status,
        onCancel: () => {
          abortController?.abort();
          handle?.unmount();
          reject(new AuthCancelledError());
        },
        onOpenBrowser: () => {
          const uri = verificationUri.value;
          if (uri) {
            try {
              const cmd =
                process.platform === 'darwin'
                  ? 'open'
                  : process.platform === 'win32'
                    ? 'start'
                    : 'xdg-open';
              execFile(cmd, [uri]);
            } catch {
              // Silently ignore — URL is displayed for manual copy
            }
          }
        },
      });
    }

    handle = tui.mount(App, config._mountOptions);
  });
}
