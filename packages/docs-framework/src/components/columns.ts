import { childrenToString } from './children';

export function Columns(props: Record<string, unknown>): string {
  const cols = Number(props.cols) || 2;
  const children = childrenToString(props.children);
  return `<div data-columns style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px;margin-bottom:16px">${children}</div>`;
}

export function Column(props: Record<string, unknown>): string {
  const children = childrenToString(props.children);
  return `<div data-column>${children}</div>`;
}
