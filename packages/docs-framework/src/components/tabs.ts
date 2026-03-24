import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function Tabs(props: Record<string, unknown>): string {
  const children = childrenToString(props.children);
  return `<div data-tabs style="margin-bottom:16px">${children}</div>`;
}

export function Tab(props: Record<string, unknown>): string {
  const title = props.title ? String(props.title) : '';
  const children = childrenToString(props.children);
  return `<div data-tab data-title="${escapeHtml(title)}" style="padding:12px 0"><div style="font-weight:500;margin-bottom:8px">${escapeHtml(title)}</div><div>${children}</div></div>`;
}
