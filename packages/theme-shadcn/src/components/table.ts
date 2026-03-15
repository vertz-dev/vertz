import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type TableBlocks = {
  root: string[];
  header: string[];
  body: string[];
  row: string[];
  head: string[];
  cell: string[];
  caption: string[];
  footer: string[];
};

export interface TableProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
}

export interface TableComponents {
  Table: (props: TableProps) => HTMLDivElement;
  TableHeader: (props: TableProps) => HTMLTableSectionElement;
  TableBody: (props: TableProps) => HTMLTableSectionElement;
  TableRow: (props: TableProps) => HTMLTableRowElement;
  TableHead: (props: TableProps) => HTMLTableCellElement;
  TableCell: (props: TableProps) => HTMLTableCellElement;
  TableCaption: (props: TableProps) => HTMLTableCaptionElement;
  TableFooter: (props: TableProps) => HTMLTableSectionElement;
}

export function createTableComponents(tableStyles: CSSOutput<TableBlocks>): TableComponents {
  function Table({ className, class: classProp, children }: TableProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.overflowX = 'auto';
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.className = [tableStyles.root, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      table.appendChild(node);
    }
    wrapper.appendChild(table);
    return wrapper;
  }

  function TableHeader({
    className,
    class: classProp,
    children,
  }: TableProps): HTMLTableSectionElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('thead');
    el.className = [tableStyles.header, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableBody({
    className,
    class: classProp,
    children,
  }: TableProps): HTMLTableSectionElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('tbody');
    el.className = [tableStyles.body, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableRow({ className, class: classProp, children }: TableProps): HTMLTableRowElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('tr');
    el.className = [tableStyles.row, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableHead({ className, class: classProp, children }: TableProps): HTMLTableCellElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('th');
    el.scope = 'col';
    el.className = [tableStyles.head, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableCell({ className, class: classProp, children }: TableProps): HTMLTableCellElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('td');
    el.className = [tableStyles.cell, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableCaption({
    className,
    class: classProp,
    children,
  }: TableProps): HTMLTableCaptionElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('caption');
    el.className = [tableStyles.caption, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableFooter({
    className,
    class: classProp,
    children,
  }: TableProps): HTMLTableSectionElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('tfoot');
    el.className = [tableStyles.footer, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  return {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    TableCaption,
    TableFooter,
  };
}
