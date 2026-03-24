import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export type CalloutType = 'note' | 'tip' | 'warning' | 'info' | 'danger' | 'check';

const CALLOUT_STYLES: Record<CalloutType, { border: string; bg: string; icon: string }> = {
  note: { border: '#2563eb', bg: '#eff6ff', icon: 'ℹ' },
  tip: { border: '#16a34a', bg: '#f0fdf4', icon: '💡' },
  warning: { border: '#ca8a04', bg: '#fefce8', icon: '⚠' },
  info: { border: '#0891b2', bg: '#ecfeff', icon: 'ℹ' },
  danger: { border: '#dc2626', bg: '#fef2f2', icon: '🚨' },
  check: { border: '#16a34a', bg: '#f0fdf4', icon: '✓' },
};

export function Callout(props: Record<string, unknown>): string {
  const type = String(props.type ?? 'note') as CalloutType;
  const title = props.title ? String(props.title) : undefined;
  const children = childrenToString(props.children);
  const style = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.note;

  let titleHtml = '';
  if (title) {
    titleHtml = `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div>`;
  }

  return `<div data-callout="${escapeHtml(type)}" style="border-left:3px solid ${style.border};background:${style.bg};padding:12px 16px;border-radius:4px;margin-bottom:16px"><span style="margin-right:8px">${style.icon}</span>${titleHtml}${children}</div>`;
}

export function Note(props: Record<string, unknown>): string {
  return Callout({ ...props, type: 'note' });
}

export function Tip(props: Record<string, unknown>): string {
  return Callout({ ...props, type: 'tip' });
}

export function Warning(props: Record<string, unknown>): string {
  return Callout({ ...props, type: 'warning' });
}

export function Info(props: Record<string, unknown>): string {
  return Callout({ ...props, type: 'info' });
}

export function Danger(props: Record<string, unknown>): string {
  return Callout({ ...props, type: 'danger' });
}

export function Check(props: Record<string, unknown>): string {
  return Callout({ ...props, type: 'check' });
}
